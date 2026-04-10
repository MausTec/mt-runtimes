export interface SkuEntry {
  versions: VersionEntry[];
}

export interface ProductCatalog {
  product: string;
  skus: Record<string, SkuEntry>;
}

export interface VersionEntry {
  version: string;
  status: "current" | "supported" | "eol";
  fingerprint?: string;
}

export interface RootCatalog {
  products: Record<string, ProductCatalog>;
}

export interface ApiDescriptor {
  sku: string;
  version: string;
  functions: HostFunctionDescriptor[];
  events: EventDescriptor[];
}

export interface EventDescriptor {
  name: string;
  permission: string | null;
  description?: string;
  payload?: PayloadField[];
}

export interface HostFunctionDescriptor {
  name: string;
  permission: string | null;
  description?: string;
  args?: ArgDescriptor[];
  returns?: string | null;
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
