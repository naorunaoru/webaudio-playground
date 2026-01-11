import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read and parse tsconfig.json
const tsconfigPath = path.resolve(__dirname, "tsconfig.json");
const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
const tsPaths: Record<string, string[]> = tsconfig.compilerOptions?.paths ?? {};

// Convert TypeScript paths to Vite aliases
// e.g., "@utils/*": ["src/utils/*"] -> "@utils": "/abs/path/to/src/utils"
export const aliases: Record<string, string> = {};

for (const [alias, targets] of Object.entries(tsPaths)) {
  const target = targets[0];
  if (!target) continue;

  // Remove trailing /* from both alias and target
  const cleanAlias = alias.replace(/\/\*$/, "");
  const cleanTarget = target.replace(/\/\*$/, "").replace(/\/index\.ts$/, "");

  aliases[cleanAlias] = path.resolve(__dirname, cleanTarget);
}
