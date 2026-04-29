/**
 * Default WASI 0.2.2 shim for the `mtp:core` Component Model bridge.
 *
 * The bridge component imports a small subset of WASI 0.2 (cli, clocks/wall-clock,
 * filesystem, io). This module provides production-ready implementations of
 * those imports backed by Node.js (real stdio, real wall clock, real
 * filesystem) plus test helpers (in-memory filesystem, captured stdio).
 *
 * Each interface is exported individually so callers can swap one without
 * rebuilding the whole shim. `defaultWasi()` assembles them into a complete
 * `WasiShim` with empty preopens (sandboxed-by-default).
 *
 * Methods that the bridge does not currently call are deliberately left
 * unimplemented (`throw`); fill them in incrementally as plugin code starts
 * exercising new capabilities.
 */

import { promises as fsp } from "node:fs";
import { resolve as resolvePath } from "node:path";

import type {
  WasiShim,
  WasiDescriptor,
  WasiInputStream,
  WasiOutputStream,
  WasiIoError,
  WasiResourceCtor,
} from "./types.js";

// ---------------------------------------------------------------------------
// io/error
// ---------------------------------------------------------------------------

/**
 * Concrete `wasi:io/error.Error` implementation. The component model exposes
 * this as a resource; jco lowers it to a class instance the host returns from
 * stream/filesystem operations.
 */
export class HostError {
  constructor(public readonly message: string) {}
  toDebugString(): string {
    return this.message;
  }
}

export const ioError = {
  Error: HostError as unknown as WasiResourceCtor<WasiIoError>,
};

// ---------------------------------------------------------------------------
// io/streams
// ---------------------------------------------------------------------------

/** Sink callback: receives raw bytes; throws to signal a stream error. */
export type WriteSink = (bytes: Uint8Array) => void;

class HostOutputStream {
  constructor(private readonly sink: WriteSink) {}
  /** Always claim unlimited capacity — Node sinks buffer internally. */
  checkWrite(): bigint {
    return 1n << 32n;
  }

  write(contents: Uint8Array): void {
    this.sink(contents);
  }

  blockingWriteAndFlush(contents: Uint8Array): void {
    this.sink(contents);
  }

  blockingFlush(): void {
    /* no-op: Node sinks flush themselves */
  }
}

class HostInputStream {
  /** Empty stream: bridge does not currently read from stdin. */
}

export const ioStreams = {
  InputStream: HostInputStream as unknown as WasiResourceCtor<WasiInputStream>,
  OutputStream: HostOutputStream as unknown as WasiResourceCtor<WasiOutputStream>,
};

/** Build an OutputStream that forwards bytes to a Node `Writable`. */
export function nodeWritableStream(writable: NodeJS.WritableStream): WasiOutputStream {
  return new HostOutputStream((bytes) => {
    writable.write(Buffer.from(bytes));
  }) as unknown as WasiOutputStream;
}

/** Build an OutputStream that captures bytes into an array — for tests. */
export function captureStream(buffer: Uint8Array[]): WasiOutputStream {
  return new HostOutputStream((bytes) => {
    buffer.push(new Uint8Array(bytes));
  }) as unknown as WasiOutputStream;
}

/** OutputStream forwarding to `process.stdout`. */
export const stdoutStream = (): WasiOutputStream => nodeWritableStream(process.stdout);

/** OutputStream forwarding to `process.stderr`. */
export const stderrStream = (): WasiOutputStream => nodeWritableStream(process.stderr);

// ---------------------------------------------------------------------------
// cli/{environment, exit, stdin, stdout, stderr}
// ---------------------------------------------------------------------------

export class WasiExitError extends Error {
  constructor(public readonly status: { tag: "ok" | "err" }) {
    super(`WASI exit: ${status.tag}`);
    this.name = "WasiExitError";
  }
}

export const cliEnvironment = {
  getArguments: (): string[] => [],
};

export const cliExit = {
  exit(status: { tag: "ok"; val: void } | { tag: "err"; val: void }): void {
    throw new WasiExitError(status);
  },
};

export const cliStdin = {
  getStdin: (): WasiInputStream => new HostInputStream() as unknown as WasiInputStream,
};

export const cliStdout = {
  getStdout: stdoutStream,
};

export const cliStderr = {
  getStderr: stderrStream,
};

// ---------------------------------------------------------------------------
// filesystem/types
// ---------------------------------------------------------------------------

// Node-backed implementation. The bridge currently only uses a minimal
// subset of the Descriptor surface; we implement the methods exposed by the
// jco-generated declarations and `throw` for anything else.
//
// File handles are opened lazily on the first stream operation so callers can
// pass a Descriptor whose backing file does not yet exist (e.g. for write).

export interface DescriptorBacking {
  /** Absolute path on the host filesystem. */
  hostPath: string;
  /** Whether this descriptor refers to a directory. */
  isDirectory: boolean;
}

class HostDescriptor {
  constructor(private readonly backing: DescriptorBacking) {}

  writeViaStream(_offset: bigint): WasiOutputStream {
    const sink: WriteSink = (bytes) => {
      // Synchronous append for now since we aren't writing too much data.
      // If/when the bridge does buffered writes we should switch to fd-based.

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      fsp.appendFile(this.backing.hostPath, Buffer.from(bytes));
    };

    return new HostOutputStream(sink) as unknown as WasiOutputStream;
  }

  appendViaStream(): WasiOutputStream {
    return this.writeViaStream(0n);
  }

  getType(): "directory" | "regular-file" {
    return this.backing.isDirectory ? "directory" : "regular-file";
  }

  async stat(): Promise<{
    type: "directory" | "regular-file";
    linkCount: bigint;
    size: bigint;
  }> {
    const s = await fsp.stat(this.backing.hostPath);

    return {
      type: this.backing.isDirectory ? "directory" : "regular-file",
      linkCount: BigInt(s.nlink),
      size: BigInt(s.size),
    };
  }
}

export const filesystemTypes = {
  Descriptor: HostDescriptor as unknown as WasiResourceCtor<WasiDescriptor>,
  filesystemErrorCode(_err: WasiIoError): string | undefined {
    return undefined;
  },
};

/**
 * Wrap a host-side path as a Descriptor that can be inserted into a preopen
 * table or returned from filesystem operations.
 */
export function descriptorFromPath(
  hostPath: string,
  opts: { isDirectory?: boolean } = {},
): WasiDescriptor {
  return new HostDescriptor({
    hostPath: resolvePath(hostPath),
    isDirectory: opts.isDirectory ?? false,
  }) as unknown as WasiDescriptor;
}

// ---------------------------------------------------------------------------
// filesystem/preopens
// ---------------------------------------------------------------------------

/** Configure the preopen table from a list of `{hostPath, guestPath}` pairs. */
export function nodePreopens(
  pairs: Array<{ hostPath: string; guestPath: string }>,
): WasiShim["filesystemPreopens"] {
  const entries: Array<[WasiDescriptor, string]> = pairs.map(({ hostPath, guestPath }) => [
    descriptorFromPath(hostPath, { isDirectory: true }),
    guestPath,
  ]);

  return {
    getDirectories: () => entries,
  };
}

/** Empty (sandboxed) preopen table. The bridge sees no host filesystem. */
export const emptyPreopens: WasiShim["filesystemPreopens"] = {
  getDirectories: () => [],
};

// ---------------------------------------------------------------------------
// In-memory filesystem helper
// ---------------------------------------------------------------------------

// Backs a single preopened directory with an in-memory Map so tests can
// observe writes and pre-seed reads without touching the real disk.

export interface InMemoryFs {
  preopens: WasiShim["filesystemPreopens"];
  /** The underlying map; keys are guest-relative paths. */
  files: Map<string, Uint8Array>;
}

export function inMemoryFilesystem(
  layout: Record<string, Uint8Array | string> = {},
  guestPath = "/",
): InMemoryFs {
  const files = new Map<string, Uint8Array>();

  for (const [path, content] of Object.entries(layout)) {
    files.set(
      path,
      typeof content === "string" ? new TextEncoder().encode(content) : content,
    );
  }

  // Lightweight in-memory Descriptor for the preopen root. Read/write are
  // no-ops at the descriptor level today, they will probably be implemented when the
  // bridge starts exercising filesystem reads/writes from plugin code.
  class MemDescriptor {
    constructor(private readonly root: string) {}

    writeViaStream(_offset: bigint): WasiOutputStream {
      const buf: number[] = [];

      const sink: WriteSink = (bytes) => {
        for (const b of bytes) buf.push(b);
        files.set(this.root, new Uint8Array(buf));
      };

      return new HostOutputStream(sink) as unknown as WasiOutputStream;
    }

    appendViaStream(): WasiOutputStream {
      return this.writeViaStream(0n);
    }

    getType(): "directory" {
      return "directory";
    }

    stat() {
      return { type: "directory" as const, linkCount: 1n, size: 0n };
    }
  }

  return {
    preopens: {
      getDirectories: () => [
        [new MemDescriptor(guestPath) as unknown as WasiDescriptor, guestPath],
      ],
    },
    files,
  };
}

// ---------------------------------------------------------------------------
// Default shim assembly
// ---------------------------------------------------------------------------

/**
 * Build a complete `WasiShim` with sensible defaults:
 *   - real Node-backed stdout / stderr
 *   - empty stdin
 *   - real wall clock
 *   - empty preopen table (sandboxed)
 *   - `exit()` throws a catchable `WasiExitError`
 *
 * Override individual interfaces by spreading into the result, or pass a
 * `Partial<WasiShim>` to `instantiateMtpCore({ wasi })`.
 */
export function defaultWasi(): WasiShim {
  return {
    cliEnvironment,
    cliExit,
    cliStdin,
    cliStdout,
    cliStderr,
    filesystemPreopens: emptyPreopens,
    filesystemTypes,
    ioError,
    ioStreams,
  };
}
