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
  VersionEntry,
  PayloadField,
  ArgDescriptor,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");

let _catalog: RootCatalog | undefined;

function loadCatalog(): RootCatalog {
  if (_catalog) return _catalog;
  const raw = readFileSync(resolve(packageRoot, "catalog.json"), "utf-8");
  _catalog = JSON.parse(raw) as RootCatalog;
  return _catalog;
}

function productForSku(sku: string): string | undefined {
  const catalog = loadCatalog();
  for (const [product, entry] of Object.entries(catalog.products)) {
    if (sku in entry.skus) return product;
  }
  return undefined;
}

/**
 * Resolve a SKU to its product directory name.
 */
export function resolveProduct(sku: string): string {
  const product = productForSku(sku);
  if (!product) throw new Error(`Unknown SKU: ${sku}`);
  return product;
}

/**
 * Get the product catalog for a given SKU or product name.
 */
export function getProductCatalog(skuOrProduct: string): ProductCatalog {
  const catalog = loadCatalog();

  if (skuOrProduct in catalog.products) {
    return catalog.products[skuOrProduct]!;
  }

  const product = productForSku(skuOrProduct);
  if (product) return catalog.products[product]!;

  throw new Error(`Unknown product or SKU: ${skuOrProduct}`);
}

/**
 * Get the SkuEntry (version list) for a specific SKU.
 */
export function getSkuEntry(sku: string): SkuEntry {
  const product = productForSku(sku);
  if (!product) throw new Error(`Unknown SKU: ${sku}`);
  return loadCatalog().products[product]!.skus[sku]!;
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
// Common mt-actions language builtins descriptor
// ---------------------------------------------------------------------------

let _mtActionsEntry: SkuEntry | undefined;

function loadMtActionsEntry(): SkuEntry {
  if (_mtActionsEntry) return _mtActionsEntry;
  const raw = readFileSync(
    resolve(packageRoot, "api", "common", "mt-actions", "catalog.json"),
    "utf-8",
  );
  _mtActionsEntry = JSON.parse(raw) as SkuEntry;
  return _mtActionsEntry;
}

/**
 * Load the mt-actions language builtin descriptor.
 * Contains all functions registered by mta_init_builtins() — available on
 * every platform that ships mt-actions 1.1.0+.
 *
 * Pass a specific `version` string to pin to a known release, or omit to
 * load the current (latest stable) version.
 */
export function getMtActionsDescriptor(version?: string): ApiDescriptor {
  const entry = loadMtActionsEntry();
  if (entry.versions.length === 0) {
    throw new Error("No mt-actions versions available");
  }

  let targetVersion = version;
  if (!targetVersion) {
    const current =
      (entry.versions as VersionEntry[]).find((v) => v.status === "current") ??
      entry.versions[0]!;
    targetVersion = (current as VersionEntry).version;
  }

  const descPath = resolve(packageRoot, "api", "common", "mt-actions", `${targetVersion}.json`);
  try {
    return JSON.parse(readFileSync(descPath, "utf-8")) as ApiDescriptor;
  } catch {
    throw new Error(`mt-actions descriptor not found for version ${targetVersion}`);
  }
}

