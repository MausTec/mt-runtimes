# @maustec/mt-runtimes

Runtime descriptors for Maus-Tec products. This package ships structured API
metadata used to resolve product, SKU, and core runtime contracts.

## Data Format

All runtime data lives under `api/`:

```text
api/
  catalog.json
  aliases.json
  core/
    <version>.json
  <product>/
    <version>.json
    <sku-lowercase>/
      <version>.json
```

- `api/catalog.json` is the root registry for core, product, and SKU versions.
- `api/aliases.json` maps family aliases such as `@eom` to product metadata.
- `api/core/<version>.json` contains core builtin descriptors.
- `api/<product>/<version>.json` contains product-level descriptors.
- `api/<product>/<sku-lowercase>/<version>.json` contains SKU-level descriptors.

## All Interfaces

This package provides an API lookup library for many languages. The basic principle is
that the developer will provide a SKU or Product tag and a constraint version, and receive
an API schema that they can adhere to that satisfies the minimum possible union of all
requested product APIs.

### Product Aliases

For convenience, the following product aliases are available:

-- tbd --


### API Version Pinning

Since product and core API varies over time, a developer may specify which specific API
version they wish to receive from the package by providing a version constraint:

-- tbd --


## TypeScript

Use the package exports to resolve aliases, versions, and descriptors:

```typescript
import { getApiDescriptor, getMtActionsDescriptor, resolveRuntimeBundle } from "@maustec/mt-runtimes";

const builtins = getMtActionsDescriptor();
const skuApi = getApiDescriptor("EOM3K", "2.0.1");

const bundle = resolveRuntimeBundle({
  sdkVersion: "~> 1.0",
  platforms: ["@eom", "eom3k == 2.0.1"],
});
```

## Future Elixir

The same `api/` data layout is intended to be consumed by a future Hex package.
The Elixir implementation should read the same catalog, alias, and descriptor
files and apply the same version-resolution rules.

## License

MIT
