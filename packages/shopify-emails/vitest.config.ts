import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // Previews show times in the developer's zone; pin one so CI's UTC runner reads the fixtures' dates the same way.
    env: { TZ: "America/Los_Angeles" },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/index.ts"],
      thresholds: {
        lines: 90,
        statements: 90,
        branches: 85,
        functions: 90
      }
    }
  }
})
