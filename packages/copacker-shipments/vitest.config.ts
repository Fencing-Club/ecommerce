import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // Low: tests never draw PDFs, and the shipping documents' model is still tested in the app, with its fixtures.
      thresholds: { lines: 42, statements: 44, functions: 52, branches: 38 }
    }
  }
})
