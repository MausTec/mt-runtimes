/**
 * Codegen: generate src/generated/api-bundle.ts
 *
 * Scans api/ and emits a TypeScript module that statically imports every JSON
 * descriptor file, keyed by its path relative to api/. This allows mt-runtimes
 * to be bundled for environments without filesystem access (browsers, bundled
 * VS Code extensions) without any manual import maintenance.
 *
 * Usage: node --experimental-strip-types scripts/generate-api-bundle.ts
 * (or via: npm run codegen)
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const apiDir = join(packageRoot, "api");
const outFile = join(packageRoot, "src", "generated", "api-bundle.ts");

// ---------------------------------------------------------------------------
// Walk api/ and collect all .json paths
// ---------------------------------------------------------------------------

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const results: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (entry.endsWith(".json")) {
      results.push(full);
    }
  }
  return results.sort();
}

const jsonFiles = walk(apiDir);

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const importLines: string[] = [];
const entryLines: string[] = [];

for (let i = 0; i < jsonFiles.length; i++) {
  const absPath = jsonFiles[i]!;
  const relToApi = relative(apiDir, absPath).replace(/\\/g, "/");
  const relToSrcGenerated = relative(join(packageRoot, "src", "generated"), absPath).replace(/\\/g, "/");
  const varName = `_file${i}`;

  importLines.push(`import ${varName} from "${relToSrcGenerated}" with { type: "json" };`);
  entryLines.push(`  "${relToApi}": ${varName},`);
}

const banner = `\
// GENERATED FILE!! do not edit by hand!!
// Re-generate with: npm run codegen
// Source: scripts/generate-api-bundle.ts
`;

const body = `\
${importLines.join("\n")}

/**
 * Static map of all api/ JSON files, keyed by path relative to api/.
 * Used as the primary data source in bundled environments where filesystem
 * access is unavailable (browsers, bundled VS Code extensions).
 */
export const apiBundle: Record<string, unknown> = {
${entryLines.join("\n")}
};
`;

writeFileSync(outFile, banner + "\n" + body, "utf-8");
console.log(`Generated ${outFile} (${jsonFiles.length} files)`);
