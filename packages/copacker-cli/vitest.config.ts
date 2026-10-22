import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/bin.ts", "src/index.ts"],
      thresholds: { lines: 66, statements: 64, functions: 56, branches: 60 }
    }
  }
})
