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
      // Below Linux's coverage, which is lower: the Windows and macOS keychain and browser code only runs on those systems.
      thresholds: { lines: 59, statements: 58, functions: 46, branches: 58 }
    }
  }
})
