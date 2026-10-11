import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The DOM test renderer lives at the workspace root; share its React instance.
  resolve: { alias: { react: resolve(__dirname, "../../node_modules/react") } },
  esbuild: { jsx: "automatic" }
});
