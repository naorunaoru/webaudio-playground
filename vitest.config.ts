import { defineConfig } from "vitest/config";
import { aliases } from "./aliases";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: aliases,
  },
});
