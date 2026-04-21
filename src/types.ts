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
