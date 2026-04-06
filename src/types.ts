export interface ProductCatalog {
  product: string;
  skus: string[];
  versions: VersionEntry[];
}

export interface VersionEntry {
  version: string;
  status: "current" | "supported" | "eol";
}

export interface RootCatalog {
  products: Record<string, ProductCatalog>;
}

export interface ApiDescriptor {
  product: string;
  version: string;
  events: EventDescriptor[];
  hostFunctions: HostFunctionDescriptor[];
  permissions: string[];
}

export interface EventDescriptor {
  name: string;
  permission?: string | undefined;
  payload?: PayloadField[] | undefined;
}

export interface HostFunctionDescriptor {
  name: string;
  permission?: string | undefined;
  args?: ArgDescriptor[] | undefined;
  returns?: string | null | undefined;
}

export interface PayloadField {
  name: string;
  type: string;
}

export interface ArgDescriptor {
  name: string;
  type: string;
}
