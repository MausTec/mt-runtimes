import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { RootCatalog, ProductCatalog, ApiDescriptor, SkuEntry, VersionEntry } from "./types.js";

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");

let _catalog: RootCatalog | undefined;

function loadCatalog(): RootCatalog {
  if (_catalog) return _catalog;
  const raw = readFileSync(resolve(packageRoot, "api", "catalog.json"), "utf-8");
  _catalog = JSON.parse(raw) as RootCatalog;
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

  const apiPath = resolve(packageRoot, "api", product, sku.toLowerCase(), `${version}.json`);

  try {
    const raw = readFileSync(apiPath, "utf-8");
    return JSON.parse(raw) as ApiDescriptor;
  } catch {
    throw new Error(`API descriptor not found for ${sku} v${version}`);
  }
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
// WASM runtime paths
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path to the mt-actions WASM binary.
 * The returned path is suitable for passing to `createRuntime({ wasm: ... })`.
 */
export function getWasmPath(): string {
  return resolve(packageRoot, "wasm", "mt-actions-core.wasm");
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

  const descPath = resolve(packageRoot, "api", "core", `${targetVersion}.json`);
  try {
    return JSON.parse(readFileSync(descPath, "utf-8")) as ApiDescriptor;
  } catch {
    throw new Error(`Core runtime descriptor not found for version ${targetVersion}`);
  }
}

