# @maustec/mt-runtimes

Runtime packs for Maus-Tec hardware products. Provides API descriptors and WASM
binaries used by `@maustec/mt-sdk` for plugin validation and simulation.

## Usage

```typescript
import { getApiDescriptor, resolveProduct, allSkus } from "@maustec/mt-runtimes";

const api = getApiDescriptor("EOM3K", "1.0.0");
```

## Structure

Each product has its own directory containing versioned API descriptors and
WASM binaries:

```
edge-o-matic/
  catalog.json
  api/          # Versioned API descriptor JSON files
  wasm/         # Versioned WASM binaries
mercury/
  catalog.json
  api/
  wasm/
```

## License

MIT
