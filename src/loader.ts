/**
 * Loader for the mtp:core Component Model bridge.
 *
 * Wraps the jco-emitted `instantiate(getCoreModule, imports)` factory in `wasm/mtp-core.js` with:
 * 
 *   - Node-friendly `getCoreModule` that reads from the package's `wasm/`
 *     directory and compiles via `WebAssembly.compile`
 *   - A typed `HostCallbacks` injection slot
 *   - A `WasiShim` with real defaults (`defaultWasi()`), overridable per interface
 *
 * Returns the typed `Bridge` instance directly — consumers never see the raw
 * jco import object or the multi-core-module split.
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Bridge, MtpCoreOptions } from "./types.js";
import { defaultWasi } from "./wasi-shim.js";

// Minimal WebAssembly type declaration used by this module. Node's @types/node
// does not declare the WebAssembly namespace; instead of pulling the entire
// `dom` lib for one feature, we declare what we need locally. WebAssembly is
// a runtime global in every supported Node version (>=12).
declare const WebAssembly: {
  compile(bytes: Uint8Array): Promise<WebAssemblyModule>;
};

type WebAssemblyModule = object;

// Path to the package's `wasm/` directory
function wasmDir(): string {
  if (typeof import.meta.url === "undefined") {
    throw new Error(
      "instantiateMtpCore() requires Node.js with ESM support; " +
        "import.meta.url is unavailable in this environment.",
    );
  }

  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "wasm");
}

/**
 * Instantiate the mtp:core Component Model bridge.
 *
 * @param options.host  Implementations of the four `mtp:core/host-callbacks`
 *                      methods (hostDispatch, configSave, traceEvent,
 *                      errorReport). Required — the bridge cannot run
 *                      without these.
 * @param options.wasi  Per-interface overrides for the WASI shim. Anything
 *                      not specified falls back to `defaultWasi()`.
 *
 * @returns The instantiated `Bridge` interface
 */
export async function instantiateMtpCore(
  options: MtpCoreOptions,
): Promise<{ bridge: Bridge }> {
  const dir = wasmDir();
  const jsPath = resolve(dir, "mtp-core.js");

  // Dynamic import so the heavy jco glue is only loaded when actually needed.
  // The `.js` file lives outside `dist/` so this should resolve to the package's
  // shipped `wasm/` directory in both the dev tree and an installed package.
  const mod = (await import(jsPath)) as {
    instantiate: (
      getCoreModule: (path: string) => Promise<WebAssemblyModule>,
      imports: Record<string, unknown>,
    ) => Promise<{ bridge: Bridge }>;
  };

  const getCoreModule = async (relPath: string): Promise<WebAssemblyModule> => {
    const buf = await readFile(resolve(dir, relPath));
    return WebAssembly.compile(buf);
  };

  const wasi = { ...defaultWasi(), ...options.wasi };

  const imports: Record<string, unknown> = {
    "mtp:core/host-callbacks": options.host,
    "wasi:cli/environment": wasi.cliEnvironment,
    "wasi:cli/exit": wasi.cliExit,
    "wasi:cli/stderr": wasi.cliStderr,
    "wasi:cli/stdin": wasi.cliStdin,
    "wasi:cli/stdout": wasi.cliStdout,
    "wasi:filesystem/preopens": wasi.filesystemPreopens,
    "wasi:filesystem/types": wasi.filesystemTypes,
    "wasi:io/error": wasi.ioError,
    "wasi:io/streams": wasi.ioStreams,
  };

  return mod.instantiate(getCoreModule, imports);
}
