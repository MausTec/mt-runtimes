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
}

export interface HostFunctionDescriptor {
  name: string;
  module?: string;
  permission: string | null;
  description?: string;
  args?: ArgDescriptor[];
  returns?: ReturnDescriptor | null;
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
