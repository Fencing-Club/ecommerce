import { fileURLToPath } from "node:url"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const dirname = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/server/**/*.ts", "src/app/api/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["src/server/worker.ts", "src/**/*.stories.tsx"]
    },
    projects: [
      {
        extends: true,
        test: { name: "unit", environment: "node", include: ["tests/**/*.test.ts"], sequence: { groupOrder: 0 } }
      },
      // Every story renders in Chromium and runs its play function, after the unit tests: run side by side, the browser
      // starves the unit tests' databases and their setup times out.
      {
        extends: true,
        plugins: [storybookTest({ configDir: `${dirname}.storybook` })],
        test: {
          name: "storybook",
          sequence: { groupOrder: 1 },
          // A story that waits on an animation or a mocked response can miss its moment on a busy machine.
          retry: 2,
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
