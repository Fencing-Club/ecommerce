import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // Low: tests never draw or read PDFs, which most of documents and labels do.
      thresholds: { lines: 68, statements: 69, functions: 79, branches: 72 }
    }
  }
})
