import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { RootCatalog, ProductCatalog, ApiDescriptor, SkuEntry, VersionEntry } from "./types.js";
import { apiBundle } from "./generated/api-bundle.js";

export type {
  RootCatalog,
  ProductCatalog,
  SkuEntry,
  ApiDescriptor,
  EventDescriptor,
  HostFunctionDescriptor,
  ReturnDescriptor,
  VersionEntry,
  PayloadField,
  ArgDescriptor,
  AliasTable,
  PlatformAlias,
  ParsedPlatformEntry,
  ResolvedPlatformInfo,
  RuntimeBundle,
} from "./types.js";

// ----------------------------------------------------------------------------- 
// Re-export WASM Runtime Core, WASI shim, resolver APIs, and version utilities
// ----------------------------------------------------------------------------- 

export { instantiateMtpCore } from "./loader.js";

export {
  defaultWasi,
  nodePreopens,
  emptyPreopens,
  inMemoryFilesystem,
  descriptorFromPath,
  nodeWritableStream,
  captureStream,
  stdoutStream,
  stderrStream,
  WasiExitError,
  HostError,
  cliEnvironment,
  cliExit,
  cliStdin,
  cliStdout,
  cliStderr,
  filesystemTypes,
  ioError,
  ioStreams,
} from "./wasi-shim.js";

export type {
  Bridge,
  HostCallbacks,
  ArgValue,
  ConfigValue,
  ExecutionResult,
  TraceKind,
  HostResult,
  HostError as HostDispatchError,
  RuntimeErrorKind,
  MtpCoreOptions,
  WasiShim,
  WasiDescriptor,
  WasiInputStream,
  WasiOutputStream,
  WasiIoError,
} from "./types.js";

export {
  resolveRuntimeBundle,
  resolveAlias,
  allAliases,
  parsePlatformEntry,
  intersectApis,
  ResolutionError,
} from "./resolver.js";

export type { ResolveOptions } from "./resolver.js";

export {
  parseVersion,
  parseConstraint,
  matchesConstraint,
  resolveVersion,
  satisfies,
  compareSemVer,
} from "./version.js";

export type { SemVer, ParsedConstraint } from "./version.js";

// ---------------------------------------------------------------------------
// Bundle-backed file loader
// ---------------------------------------------------------------------------

// Only evaluated if the bundle misses a file (Node.js fallback).
// Kept in a function so `fileURLToPath(import.meta.url)` is never executed at
// module load time, which would crash when bundled as CJS (import.meta.url -> undefined).
let _packageRoot: string | undefined;

function getPackageRoot(): string {
  if (_packageRoot) return _packageRoot;

  if (typeof import.meta.url === "undefined") {
    throw new Error(
      "Filesystem fallback unavailable in bundled environments. " +
        "Regenerate the API bundle with `npm run codegen`.",
    );
  }

  _packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  return _packageRoot;
}

/**
 * Load an api/ file by path relative to the api/ directory.
 * Primary: statically-bundled data (works everywhere, including browsers).
 * Fallback: readFileSync for files added to disk before the next codegen run.
 * @internal Used by resolver.ts; not part of the public API.
 */
export function loadApiFile(relPath: string): unknown {
  if (Object.prototype.hasOwnProperty.call(apiBundle, relPath)) {
    return apiBundle[relPath];
  }

  try {
    return JSON.parse(readFileSync(resolve(getPackageRoot(), "api", relPath), "utf-8"));
  } catch {
    throw new Error(`API file not found in bundle or on disk: ${relPath}`);
  }
}

// ---------------------------------------------------------------------------
// Catalog access
// ---------------------------------------------------------------------------

let _catalog: RootCatalog | undefined;

function loadCatalog(): RootCatalog {
  if (_catalog) return _catalog;
  _catalog = loadApiFile("catalog.json") as RootCatalog;
  return _catalog;
}

function productForSku(sku: string): string | undefined {
  const catalog = loadCatalog();
  const skuLower = sku.toLowerCase();
  for (const [product, entry] of Object.entries(catalog.products)) {
    for (const key of Object.keys(entry.skus)) {
      if (key.toLowerCase() === skuLower) return product;
    }
  }
  return undefined;
}

/** Resolve the canonical SKU key (preserving catalog casing) from any casing. */
function canonicalSku(sku: string): string | undefined {
  const catalog = loadCatalog();
  const skuLower = sku.toLowerCase();
  for (const entry of Object.values(catalog.products)) {
    for (const key of Object.keys(entry.skus)) {
      if (key.toLowerCase() === skuLower) return key;
    }
  }
  return undefined;
}

/** Resolve the canonical product key (preserving catalog casing) from any casing. */
function canonicalProduct(product: string): string | undefined {
  const catalog = loadCatalog();
  const lower = product.toLowerCase();
  for (const key of Object.keys(catalog.products)) {
    if (key.toLowerCase() === lower) return key;
  }
  return undefined;
}

/**
 * Resolve a SKU to its product directory name.
 * Lookup is case-insensitive.
 */
export function resolveProduct(sku: string): string {
  const product = productForSku(sku);
  if (!product) throw new Error(`Unknown SKU: ${sku}`);
  return product;
}

/**
 * Get the product catalog for a given SKU or product name.
 * Lookup is case-insensitive for both product names and SKUs.
 */
export function getProductCatalog(skuOrProduct: string): ProductCatalog {
  const catalog = loadCatalog();

  // Try as product name (case-insensitive)
  const prodKey = canonicalProduct(skuOrProduct);
  if (prodKey) return catalog.products[prodKey]!;

  // Try as SKU (case-insensitive)
  const product = productForSku(skuOrProduct);
  if (product) return catalog.products[product]!;

  throw new Error(`Unknown product or SKU: ${skuOrProduct}`);
}

/**
 * Get the SkuEntry (version list) for a specific SKU.
 * Lookup is case-insensitive.
 */
export function getSkuEntry(sku: string): SkuEntry {
  const product = productForSku(sku);
  if (!product) throw new Error(`Unknown SKU: ${sku}`);
  const canon = canonicalSku(sku)!;
  return loadCatalog().products[product]!.skus[canon]!;
}

/**
 * Load an API descriptor for a specific SKU and version.
 * Path layout: api/<product>/<sku-lowercase>/<version>.json
 */
export function getApiDescriptor(sku: string, version: string): ApiDescriptor {
  const product = productForSku(sku);
  if (!product) throw new Error(`Unknown SKU: ${sku}`);
  return loadApiFile(`${product}/${sku.toLowerCase()}/${version}.json`) as ApiDescriptor;
}

/**
 * Load the API descriptor for the current (latest stable) version of a SKU.
 * Picks the entry with status "current"; falls back to the first entry.
 * Throws if no versions are registered for the SKU.
 */
export function getLatestApiDescriptor(sku: string): ApiDescriptor {
  const entry = getSkuEntry(sku);
  if (entry.versions.length === 0) {
    throw new Error(`No API versions registered for SKU: ${sku}`);
  }
  const current = entry.versions.find((v) => v.status === "current") ?? entry.versions[0]!;
  return getApiDescriptor(sku, current.version);
}

/**
 * List all known SKUs across all products.
 */
export function allSkus(): string[] {
  const catalog = loadCatalog();
  return Object.values(catalog.products).flatMap((p) => Object.keys(p.skus));
}

/**
 * List all product names.
 */
export function allProducts(): string[] {
  return Object.keys(loadCatalog().products);
}

// ---------------------------------------------------------------------------
// Core runtime builtins descriptor
// ---------------------------------------------------------------------------

function loadCoreEntry(): SkuEntry {
  return loadCatalog().core;
}

/**
 * Get the core runtime version catalog.
 */
export function getCoreCatalog(): SkuEntry {
  return loadCoreEntry();
}

/**
 * Load the core runtime builtin descriptor.
 * Contains all functions registered by mta_init_builtins() — available on
 * every platform that ships mt-actions 1.1.0+.
 *
 * Pass a specific `version` string to pin to a known release, or omit to
 * load the current (latest stable) version.
 */
export function getMtActionsDescriptor(version?: string): ApiDescriptor {
  const entry = loadCoreEntry();
  if (entry.versions.length === 0) {
    throw new Error("No core runtime versions available");
  }

  let targetVersion = version;
  if (!targetVersion) {
    const current =
      (entry.versions as VersionEntry[]).find((v) => v.status === "current") ??
      entry.versions[0]!;
    targetVersion = (current as VersionEntry).version;
  }

  return loadApiFile(`core/${targetVersion}.json`) as ApiDescriptor;
}
