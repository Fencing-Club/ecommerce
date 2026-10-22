import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // Low: tests never draw or read PDFs, which most of documents and labels do, and shipment-artifacts has no tests yet.
      thresholds: { lines: 60, statements: 61, functions: 73, branches: 64 }
    }
  }
})
