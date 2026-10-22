import { fileURLToPath } from "node:url"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const dirname = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Each database suite starts an embedded PostgreSQL instance, so concurrency is a fixed count, not the host's cores.
    // CI's four-core machines run four; locally twelve took the unit tests from 108 to 38 seconds.
    maxWorkers: process.env.CI ? 4 : 12,
    // `pnpm verify` runs only the tests a change reaches (`--changed`). Vitest's defaults rerun everything when a
    // config or package.json changes; a lockfile change reaches every test too.
    forceRerunTriggers: ["**/package.json", "**/{vitest,vite}.config.*", "**/pnpm-lock.yaml"],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/server/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["src/server/worker.ts", "src/**/*.stories.tsx"]
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          // Request fixtures use this origin, independently of the developer's local app port.
          env: { APP_URL: "http://localhost:3000", APP_ALIAS_URLS: "" },
          include: ["tests/**/*.test.ts"],
          // The database tests' schema, built once from src/db/schema.ts.
          globalSetup: ["tests/database-setup.ts"],
          sequence: { groupOrder: 0 }
        }
      },
      // Every story renders in Chromium and runs its play function, after the unit tests: run side by side, the browser
      // starves the unit tests' databases and their setup times out.
      {
        extends: true,
        // Stories tagged "simulator" are for trying the rules and documents by hand, and stories tagged "documents"
        // render real PDFs to look at; test runs leave both out.
        plugins: [storybookTest({ configDir: `${dirname}.storybook`, tags: { exclude: ["simulator", "documents"] } })],
        test: {
          name: "storybook",
          sequence: { groupOrder: 1 },
          // Animations and transitions end at once under test, so no play function races a fading popup.
          setupFiles: [".storybook/vitest.setup.ts"],
          // The longest stories, such as getting started typed through or the landing's journey, take 30 seconds on a
          // machine running the whole suite.
          testTimeout: 60000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }]
          }
        }
      }
    ]
  }
})
