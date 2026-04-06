import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { RootCatalog, ProductCatalog, ApiDescriptor } from "./types.js";

export type {
  RootCatalog,
  ProductCatalog,
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
    if (entry.skus.includes(sku)) return product;
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
 * Load an API descriptor for a specific product and version.
 */
export function getApiDescriptor(
  skuOrProduct: string,
  version: string,
): ApiDescriptor {
  const catalog = loadCatalog();
  let product: string;

  if (skuOrProduct in catalog.products) {
    product = skuOrProduct;
  } else {
    const resolved = productForSku(skuOrProduct);
    if (!resolved) throw new Error(`Unknown product or SKU: ${skuOrProduct}`);
    product = resolved;
  }

  const apiPath = resolve(packageRoot, product, "api", `${version}.json`);

  try {
    const raw = readFileSync(apiPath, "utf-8");
    return JSON.parse(raw) as ApiDescriptor;
  } catch {
    throw new Error(
      `API descriptor not found for ${product} v${version}`,
    );
  }
}

/**
 * List all known SKUs.
 */
export function allSkus(): string[] {
  const catalog = loadCatalog();
  return Object.values(catalog.products).flatMap((p) => p.skus);
}

/**
 * List all product names.
 */
export function allProducts(): string[] {
  return Object.keys(loadCatalog().products);
}
