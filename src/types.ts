export interface SkuEntry {
  versions: VersionEntry[];
}

export interface ProductCatalog {
  /** Product-level (family) API versions. */
  versions?: VersionEntry[];
  skus: Record<string, SkuEntry>;
}

export interface VersionEntry {
  version: string;
  status: "current" | "supported" | "eol";
  fingerprint?: string;
}

export interface RootCatalog {
  core: { versions: VersionEntry[] };
  products: Record<string, ProductCatalog>;
}

export interface ApiDescriptor {
  /** Product identifier (e.g. "edge-o-matic", "core"). Always present. */
  product: string;
  /** SKU identifier. Present for SKU-specific descriptors, absent for product-level. */
  sku?: string;
  version: string;
  functions: HostFunctionDescriptor[];
  events: EventDescriptor[];
}

export interface ReturnDescriptor {
  type: "int" | "float" | "string" | "bool" | "bytes";
  description?: string;
}

export interface EventDescriptor {
  name: string;
  module?: string;
  permission: string | null;
  description?: string;
  payload?: PayloadField[];
  /** Set by the resolver to indicate where this event was loaded from. */
  origin?: string;
}

export interface HostFunctionDescriptor {
  name: string;
  module?: string;
  permission: string | null;
  description?: string;
  args?: ArgDescriptor[];
  returns?: ReturnDescriptor | null;
  /** When true, the function accepts additional arguments beyond those listed in `args`. */
  variadic?: boolean;
  /** Set by the resolver to indicate where this function was loaded from. */
  origin?: string;
}

export interface PayloadField {
  name: string;
  type: "int" | "float" | "string" | "bool" | "bytes";
  description?: string;
}

export interface ArgDescriptor {
  name: string;
  type: "int" | "float" | "string" | "bool" | "bytes";
  description?: string;
  optional?: boolean;
}

// ---------------------------------------------------------------------------
// Platform alias / family types
// ---------------------------------------------------------------------------

/** A single entry in aliases.json mapping a shorthand to a product family. */
export interface PlatformAlias {
  /** Product directory name (e.g. "edge-o-matic") used as catalog key and API path. */
  product: string;
  /** SKUs that belong to this family */
  skus: string[];
}

/** The full aliases.json file shape. Keys are prefixed with @. */
export interface AliasTable {
  [alias: string]: PlatformAlias;
}



// ---------------------------------------------------------------------------
// Resolver types
// ---------------------------------------------------------------------------

/** A parsed platform entry from @platforms metadata. */
export interface ParsedPlatformEntry {
  /** Raw string, e.g. "@eom ~> 2.0" */
  raw: string;
  /** The identifier portion, e.g. "@eom" or "eom3k" */
  identifier: string;
  /** Version constraint or null for "latest current" */
  constraint: string | null;
  /** True if prefixed with @ (targets a family) */
  isFamily: boolean;
}

/** Information about a single resolved platform in the bundle. */
export interface ResolvedPlatformInfo {
  /** Original identifier from the source */
  identifier: string;
  /** Whether this was a family or SKU reference */
  isFamily: boolean;
  /** The version that was resolved */
  resolvedVersion: string;
  /** For families: the family name. For SKUs: the SKU. */
  source: string;
}

/**
 * The resolved runtime bundle returned by the resolver. Contains everything
 * the linker needs to validate a plugin.
 */
export interface RuntimeBundle {
  /** mt-actions core builtins resolved from @sdk_version */
  builtins: ApiDescriptor;
  /**
   * The merged platform API is an intersection of all resolved @platforms entries.
   * Null when @platforms is empty or not specified.
   */
  platformApi: ApiDescriptor | null;
  /** Metadata about each resolved platform (for diagnostics/hover). */
  resolvedPlatforms: ResolvedPlatformInfo[];
}

/**
 * @deprecated Removed in 0.1.0. The Component Model toolchain replaced the
 * Emscripten flow; use `instantiateMtpCore()` from the package root.
 *
 * It will be deleted once mt-sdk is updated.
 */
export interface WasmBundle {
  binary: ArrayBuffer;
  factory: (opts: Record<string, unknown>) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// mtp:core Component Model Types
// ---------------------------------------------------------------------------

// Re-exports of the jco-generated declarations so consumers of @maustec/mt-runtimes
// never have to reach into wasm/. The wrapper module (loader.ts) returns these
// types from `instantiateMtpCore()`.

import type * as MtpCoreBridge from "../wasm/interfaces/mtp-core-bridge.js";
import type * as MtpCoreTypes from "../wasm/interfaces/mtp-core-types.js";

import type {
  Descriptor as WasiDescriptor,
} from "../wasm/interfaces/wasi-filesystem-types.js";

import type {
  InputStream as WasiInputStream,
  OutputStream as WasiOutputStream,
  Error as WasiIoError,
} from "../wasm/interfaces/wasi-io-streams.js";

/** The `mtp:core/bridge` export interface */
export type Bridge = typeof MtpCoreBridge;

/**
 * The `mtp:core/host-callbacks` import interface.
 *
 * Declared as an explicit interface (not `typeof MtpCoreHostCallbacks`)
 * so that plain object literals satisfy the type without requiring a module
 * namespace shape (which TypeScript would require a `default` property for).
 */
export interface HostCallbacks {
  hostDispatch(slot: number, fnName: string, args: ArgValue[]): HostResult;
  configSave(slot: number): boolean;
  traceEvent(slot: number, kind: TraceKind, fnName: string, retCode: number): void;
  errorReport(slot: number, fnName: string, errorCode: number): void;
}

export type ArgValue = MtpCoreTypes.ArgValue;
export type ConfigValue = MtpCoreTypes.ConfigValue;
export type ExecutionResult = MtpCoreTypes.ExecutionResult;
export type TraceKind = MtpCoreTypes.TraceKind;
export type HostResult = MtpCoreTypes.HostResult;
export type HostError = MtpCoreTypes.HostError;
export type RuntimeErrorKind = MtpCoreTypes.RuntimeErrorKind;

export type { WasiDescriptor, WasiInputStream, WasiOutputStream, WasiIoError };

/**
 * Loose constructor type for WASI resource classes. The jco-generated
 * declarations expose these resources as classes with private constructors,
 * which means we can't satisfy `typeof Class` from a host implementation.
 * 
 * We just need *some* constructor that produces objects with the
 * right method shape. The actual instances are opaque to the bridge.
 */
export type WasiResourceCtor<T> = new (...args: never[]) => T;

/**
 * Concrete WASI shim: one impl per `wasi:*` import the bridge component
 * relies on. Defaults are supplied by `defaultWasi()`. Override individual
 * interfaces to redirect filesystem/streams for tests or sandboxing.
 */
export interface WasiShim {
  cliEnvironment: { getArguments(): string[] };
  cliExit: { exit(status: { tag: "ok"; val: void } | { tag: "err"; val: void }): void };
  cliStderr: { getStderr(): WasiOutputStream };
  cliStdin: { getStdin(): WasiInputStream };
  cliStdout: { getStdout(): WasiOutputStream };
  filesystemPreopens: { getDirectories(): Array<[WasiDescriptor, string]> };

  filesystemTypes: {
    Descriptor: WasiResourceCtor<WasiDescriptor>;
    filesystemErrorCode(err: WasiIoError): string | undefined;
  };

  ioError: { Error: WasiResourceCtor<WasiIoError> };

  ioStreams: {
    InputStream: WasiResourceCtor<WasiInputStream>;
    OutputStream: WasiResourceCtor<WasiOutputStream>;
  };
}

/** Options accepted by `instantiateMtpCore()`. */
export interface MtpCoreOptions {
  /** Implementations of the four mtp:core/host-callbacks methods. */
  host: HostCallbacks;
  /**
   * Per-interface overrides for the WASI shim. Anything not specified falls
   * back to `defaultWasi()`, which provides real Node-backed stdio, wall
   * clock, and an empty (sandboxed) filesystem preopen table.
   */
  wasi?: Partial<WasiShim>;
}
