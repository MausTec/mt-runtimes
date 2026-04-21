/**
 * Platform resolver for MTP plugins.
 *
 * Resolves @sdk_version and @platforms metadata into a concrete RuntimeBundle
 * that the linker can validate against.
 */
import type {
  AliasTable,
  ApiDescriptor,
  HostFunctionDescriptor,
  EventDescriptor,
  ArgDescriptor,
  ParsedPlatformEntry,
  ResolvedPlatformInfo,
  RuntimeBundle,
  VersionEntry,
} from "./types.js";
import { resolveVersion } from "./version.js";
import { getApiDescriptor, getSkuEntry, getMtActionsDescriptor, getProductCatalog, getCoreCatalog, loadApiFile } from "./index.js";

// ---------------------------------------------------------------------------
// Alias table loading
// ---------------------------------------------------------------------------

let _aliases: AliasTable | undefined;

function loadAliases(): AliasTable {
  if (_aliases) return _aliases;
  _aliases = loadApiFile("aliases.json") as AliasTable;
  return _aliases;
}

/**
 * Resolve a platform alias (e.g. "@eom") to its family definition.
 * Returns null if the alias is not recognized.
 */
export function resolveAlias(alias: string): AliasTable[string] | null {
  const table = loadAliases();
  return table[alias] ?? null;
}

/**
 * List all known platform aliases.
 */
export function allAliases(): string[] {
  return Object.keys(loadAliases());
}

// ---------------------------------------------------------------------------
// Product-level API loading
// ---------------------------------------------------------------------------

function loadProductApiDescriptor(product: string, version: string): ApiDescriptor {
  return loadApiFile(`${product}/${version}.json`) as ApiDescriptor;
}

// ---------------------------------------------------------------------------
// Platform entry parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single @platforms array entry like "@eom ~> 2.0" or "eom3k == 2.0.1".
 */
export function parsePlatformEntry(raw: string): ParsedPlatformEntry {
  const trimmed = raw.trim();

  // Split on first whitespace to separate identifier from constraint
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) {
    return {
      raw: trimmed,
      identifier: trimmed,
      constraint: null,
      isFamily: trimmed.startsWith("@"),
    };
  }

  const identifier = trimmed.slice(0, spaceIdx);
  const constraint = trimmed.slice(spaceIdx + 1).trim();

  return {
    raw: trimmed,
    identifier,
    constraint: constraint.length > 0 ? constraint : null,
    isFamily: identifier.startsWith("@"),
  };
}

// ---------------------------------------------------------------------------
// API intersection
// ---------------------------------------------------------------------------

/**
 * Function signature key for intersection matching.
 * Two functions match if they share module + name + required arg count + arg types.
 */
function functionKey(fn: HostFunctionDescriptor): string {
  const args = (fn.args ?? [])
    .filter((a) => !a.optional)
    .map((a) => a.type)
    .join(",");
  return `${fn.module ?? ""}:${fn.name}(${args})`;
}

/**
 * Event key for intersection matching. Module + name + payload shape.
 */
function eventKey(ev: EventDescriptor): string {
  const payload = (ev.payload ?? []).map((p) => `${p.name}:${p.type}`).join(",");
  return `${ev.module ?? ""}:${ev.name}(${payload})`;
}

/**
 * Returns true if two arg lists are structurally compatible.
 * Compatible means: same required args (name, type, order), and optional
 * args present in both.
 */
function argsCompatible(a: ArgDescriptor[], b: ArgDescriptor[]): boolean {
  const reqA = a.filter((x) => !x.optional);
  const reqB = b.filter((x) => !x.optional);

  if (reqA.length !== reqB.length) return false;

  for (let i = 0; i < reqA.length; i++) {
    if (reqA[i]!.type !== reqB[i]!.type) return false;
  }

  return true;
}

/**
 * Descriptor-like shape for intersection input. Both ApiDescriptor and
 * FamilyDescriptor have functions and events arrays.
 */
interface DescriptorLike {
  functions: HostFunctionDescriptor[];
  events: EventDescriptor[];
}

/**
 * Compute the intersection of multiple API descriptors. A function or event
 * is included only if it appears in ALL descriptors with a compatible signature.
 *
 * For functions present in all: uses the first descriptor's definition as the
 * canonical shape. Description may differ, it's up to the caller to merge docs separately.
 *
 * For functions with optional args: only optional args present in ALL descriptors
 * are included.
 */
export function intersectApis(descriptors: DescriptorLike[]): {
  functions: HostFunctionDescriptor[];
  events: EventDescriptor[];
} {
  if (descriptors.length === 0) return { functions: [], events: [] };
  if (descriptors.length === 1) {
    return {
      functions: [...descriptors[0]!.functions],
      events: [...descriptors[0]!.events],
    };
  }

  // Index all descriptors by function key
  const fnMaps = descriptors.map((d) => {
    const map = new Map<string, HostFunctionDescriptor>();
    for (const fn of d.functions) {
      map.set(functionKey(fn), fn);
    }
    return map;
  });

  // A function is in the intersection if its key exists in ALL descriptors
  // and all instances have compatible arg signatures
  const intersectedFunctions: HostFunctionDescriptor[] = [];
  const firstFnMap = fnMaps[0]!;

  for (const [key, canonicalFn] of firstFnMap) {
    let inAll = true;

    for (let i = 1; i < fnMaps.length; i++) {
      const other = fnMaps[i]!.get(key);
      if (!other || !argsCompatible(canonicalFn.args ?? [], other.args ?? [])) {
        inAll = false;
        break;
      }
    }

    if (inAll) {
      // Compute the intersection of optional args
      const optionalArgsInAll = (canonicalFn.args ?? [])
        .filter((a) => a.optional)
        .filter((optArg) =>
          fnMaps.every((m) => {
            const fn = m.get(key);
            return fn?.args?.some((a) => a.name === optArg.name && a.type === optArg.type && a.optional);
          }),
        );

      const requiredArgs = (canonicalFn.args ?? []).filter((a) => !a.optional);
      const finalArgs = [...requiredArgs, ...optionalArgsInAll];

      const merged: HostFunctionDescriptor = { ...canonicalFn };
      if (finalArgs.length > 0) {
        merged.args = finalArgs;
      } else {
        delete merged.args;
      }

      intersectedFunctions.push(merged);
    }
  }

  // Same for events
  const evMaps = descriptors.map((d) => {
    const map = new Map<string, EventDescriptor>();
    for (const ev of d.events) {
      map.set(eventKey(ev), ev);
    }
    return map;
  });

  const intersectedEvents: EventDescriptor[] = [];
  const firstEvMap = evMaps[0]!;

  for (const [key, canonicalEv] of firstEvMap) {
    const inAll = evMaps.every((m) => m.has(key));
    if (inAll) {
      intersectedEvents.push({ ...canonicalEv });
    }
  }

  return { functions: intersectedFunctions, events: intersectedEvents };
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Error thrown when a runtime bundle cannot be resolved.
 */
export class ResolutionError extends Error {
  constructor(
    message: string,
    public readonly details: string[],
  ) {
    super(message);
    this.name = "ResolutionError";
  }
}

export interface ResolveOptions {
  /** Platform entries from @platforms, e.g. ["@eom ~> 1.0", "m1k ~> 1.0"] */
  platforms?: string[];
  /** SDK version constraint from @sdk_version, e.g. "~> 1.0" */
  sdkVersion?: string | null;
}

/**
 * Resolve a complete runtime bundle from plugin metadata.
 *
 * Given @platforms entries and an @sdk_version constraint, resolves all
 * version constraints, loads the appropriate descriptors, computes the
 * cross-platform intersection, and returns the definitive API contract.
 *
 * @throws {ResolutionError} when the request cannot be validated
 */
export function resolveRuntimeBundle(options: ResolveOptions): RuntimeBundle {
  const errors: string[] = [];
  const resolvedPlatforms: ResolvedPlatformInfo[] = [];

  // -----------------------------------------------------------------------
  // 1. Resolve mt-actions builtins from @sdk_version
  // -----------------------------------------------------------------------
  let builtins: ApiDescriptor;
  try {
    builtins = resolveSdkVersion(options.sdkVersion ?? null);
  } catch (e) {
    throw new ResolutionError(
      `Cannot resolve @sdk_version: ${(e as Error).message}`,
      [(e as Error).message],
    );
  }

  // -----------------------------------------------------------------------
  // 2. Resolve @platforms entries
  // -----------------------------------------------------------------------
  const platformEntries = options.platforms ?? [];
  const descriptors: DescriptorLike[] = [];

  // Handle @all special case
  const isAll = platformEntries.length === 1 && platformEntries[0]?.trim() === "@all";

  if (!isAll) {
    for (const rawEntry of platformEntries) {
      const entry = parsePlatformEntry(rawEntry);

      if (entry.isFamily) {
        const result = resolveFamily(entry);
        if ("error" in result) {
          errors.push(result.error);
        } else {
          descriptors.push(result.descriptor);
          resolvedPlatforms.push(result.info);
        }
      } else {
        const result = resolveSku(entry);
        if ("error" in result) {
          errors.push(result.error);
        } else {
          descriptors.push(result.descriptor);
          resolvedPlatforms.push(result.info);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new ResolutionError(
      `Platform resolution failed:\n  - ${errors.join("\n  - ")}`,
      errors,
    );
  }

  // -----------------------------------------------------------------------
  // 3. Compute intersection of all resolved platform APIs
  // -----------------------------------------------------------------------
  let platformApi: ApiDescriptor | null = null;

  if (descriptors.length > 0) {
    const intersection = intersectApis(descriptors);

    // Build a synthetic ApiDescriptor for the merged contract
    platformApi = {
      product: resolvedPlatforms.map((p) => p.identifier).join("+"),
      version: resolvedPlatforms.map((p) => `${p.identifier}@${p.resolvedVersion}`).join(", "),
      functions: intersection.functions,
      events: intersection.events,
    };
  }

  return { builtins, platformApi, resolvedPlatforms };
}

// ---------------------------------------------------------------------------
// Internal resolution helpers
// ---------------------------------------------------------------------------

type ResolveResult = { descriptor: ApiDescriptor; info: ResolvedPlatformInfo } | { error: string };

function resolveSdkVersion(constraint: string | null): ApiDescriptor {
  // getMtActionsDescriptor handles loading the core catalog
  // We need to resolve the constraint against available versions first
  if (constraint === null) {
    return getMtActionsDescriptor();
  }

  // Load the core version catalog from the root catalog to resolve the constraint
  const catalog = getCoreCatalog();

  const resolved = resolveVersion(catalog.versions, constraint);
  if (!resolved) {
    throw new Error(`No core runtime version satisfies constraint "${constraint}"`);
  }

  return getMtActionsDescriptor(resolved.version);
}

function resolveFamily(entry: ParsedPlatformEntry): ResolveResult {
  const alias = resolveAlias(entry.identifier);
  if (!alias) {
    return { error: `Unknown platform family: "${entry.identifier}"` };
  }

  let productCatalog;
  try {
    productCatalog = getProductCatalog(alias.product);
  } catch {
    return { error: `No product catalog found for family "${entry.identifier}" (${alias.product})` };
  }

  const familyVersions = productCatalog.versions ?? [];
  if (familyVersions.length === 0) {
    return { error: `No API versions registered for family "${entry.identifier}" (${alias.product})` };
  }

  const resolved = resolveVersion(familyVersions, entry.constraint);
  if (!resolved) {
    const constraintDesc = entry.constraint ? ` satisfying "${entry.constraint}"` : "";
    return {
      error: `No API version found for family "${entry.identifier}"${constraintDesc}. Available: ${familyVersions.map((v: VersionEntry) => v.version).join(", ") || "none"}`,
    };
  }

  let descriptor: ApiDescriptor;
  try {
    descriptor = loadProductApiDescriptor(alias.product, resolved.version);
  } catch {
    return { error: `API descriptor not found for ${entry.identifier} v${resolved.version}` };
  }

  // Tag all functions/events with their origin (product-level = family)
  for (const fn of descriptor.functions) fn.origin = alias.product;
  for (const ev of descriptor.events) ev.origin = alias.product;

  return {
    descriptor,
    info: {
      identifier: entry.identifier,
      isFamily: true,
      resolvedVersion: resolved.version,
      source: alias.product,
    },
  };
}

function resolveSku(entry: ParsedPlatformEntry): ResolveResult {
  // Normalize to uppercase for catalog lookup
  const sku = entry.identifier.toUpperCase();

  let skuEntry;
  try {
    skuEntry = getSkuEntry(sku);
  } catch {
    return { error: `Unknown SKU: "${entry.identifier}" (looked up as ${sku})` };
  }

  const resolved = resolveVersion(skuEntry.versions, entry.constraint);
  if (!resolved) {
    const constraintDesc = entry.constraint ? ` satisfying "${entry.constraint}"` : "";
    return {
      error: `No API version found for SKU "${sku}"${constraintDesc}. Available: ${skuEntry.versions.map((v) => v.version).join(", ") || "none"}`,
    };
  }

  let descriptor: ApiDescriptor;
  try {
    descriptor = getApiDescriptor(sku, resolved.version);
  } catch {
    return { error: `API descriptor not found for ${sku} v${resolved.version}` };
  }

  // Tag all functions/events with their origin (SKU-level)
  for (const fn of descriptor.functions) fn.origin = sku;
  for (const ev of descriptor.events) ev.origin = sku;

  return {
    descriptor,
    info: {
      identifier: entry.identifier,
      isFamily: false,
      resolvedVersion: resolved.version,
      source: sku,
    },
  };
}
