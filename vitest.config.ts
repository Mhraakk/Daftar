import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  esbuild: { jsx: "automatic" },
  test: { include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"], environment: "node", testTimeout: 120_000, fileParallelism: false, env: { TZ: "UTC" } },
});
