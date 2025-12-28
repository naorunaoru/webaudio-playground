import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

const skipWasm = process.env.SKIP_WASM === "1";
if (skipWasm) process.exit(0);

const repoRoot = process.cwd();
const nodesRoot = path.join(repoRoot, "src", "nodes");

function listNodeBuildSteps() {
  const entries = readdirSync(nodesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));

  const steps = [];
  for (const dir of entries) {
    const base = path.join(nodesRoot, dir);
    const sh = path.join(base, "build-wasm.sh");
    const mjs = path.join(base, "build-wasm.mjs");
    if (existsSync(mjs)) steps.push({ node: dir, kind: "node", file: mjs });
    else if (existsSync(sh)) steps.push({ node: dir, kind: "bash", file: sh });
  }
  return steps;
}

const steps = listNodeBuildSteps();
if (steps.length === 0) process.exit(0);

for (const step of steps) {
  console.log(`[wasm] Building ${step.node}...`);
  const result =
    step.kind === "node"
      ? spawnSync("node", [step.file], { stdio: "inherit" })
      : spawnSync("bash", [step.file], { stdio: "inherit" });
  const code = result.status ?? 1;
  if (code !== 0) {
    console.error("");
    console.error(`[wasm] Failed to build WASM for node: ${step.node}`);
    console.error("[wasm] Fix the node's build script or skip with:");
    console.error("[wasm]   SKIP_WASM=1 npm run dev");
    console.error("");
    process.exit(code);
  }
}

process.exit(0);
