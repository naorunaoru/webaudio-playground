import type { Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { transform } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import wasm from "vite-plugin-wasm";

function computeBase(): string {
  if (process.env.VITE_BASE) return process.env.VITE_BASE;

  const githubRepo = process.env.GITHUB_REPOSITORY; // "owner/repo"
  const isGithubActions = process.env.GITHUB_ACTIONS === "true";
  if (isGithubActions && githubRepo) {
    const repoName = githubRepo.split("/")[1];
    if (repoName) {
      if (repoName.endsWith(".github.io")) return "/";
      return `/${repoName}/`;
    }
  }

  return "/";
}

function audioWorkletPlugin(): Plugin {
  const query = "?worklet";
  const prefix = "\0audio-worklet:";
  let rootDir = process.cwd();
  let command: "build" | "serve" = "serve";

  return {
    name: "audio-worklet",
    enforce: "pre",
    configResolved(config) {
      rootDir = config.root;
      command = config.command;
    },
    resolveId(source, importer) {
      if (!source.endsWith(query)) return null;
      const cleanSource = source.slice(0, -query.length);
      const importerPath = importer ? importer.split("?")[0] : null;
      const baseDir = importerPath ? path.dirname(importerPath) : rootDir;
      const resolved = path.resolve(baseDir, cleanSource);
      return `${prefix}${resolved}`;
    },
    async load(id) {
      if (!id.startsWith(prefix)) return null;
      const filePath = id.slice(prefix.length);

      if (command === "serve") {
        const rel = path.relative(rootDir, filePath).split(path.sep).join("/");
        return `export default ${JSON.stringify(`/${rel}`)};`;
      }

      const source = await readFile(filePath, "utf8");
      const out = await transform(source, {
        loader: filePath.endsWith(".ts") ? "ts" : "js",
        format: "esm",
        target: "es2022",
        platform: "browser",
      });

      const baseName = path.basename(filePath).replace(/\.[^.]+$/, "");
      const refId = this.emitFile({
        type: "asset",
        name: `${baseName}.js`,
        source: out.code,
      });

      return `export default import.meta.ROLLUP_FILE_URL_${refId};`;
    },
  };
}

export default defineConfig(() => ({
  base: computeBase(),
  plugins: [wasm(), audioWorkletPlugin(), react()],
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
}));
