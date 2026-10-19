import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig, type TestProjectInlineConfiguration } from "vitest/config"

const dirname = fileURLToPath(new URL(".", import.meta.url))

// The stories tagged "vrt", each compared with its reference screenshot once its play function is done
// (.storybook/vrt.setup.ts). It runs only when it's asked for, with `--project vrt` (pnpm test:vrt), so `pnpm test`
// never takes screenshots. See docs/visual-regression.md.
const visualRegression = (): TestProjectInlineConfiguration => ({
  extends: true,
  plugins: [storybookTest({ configDir: `${dirname}.storybook`, tags: { include: ["vrt"] } })],
  test: {
    name: "vrt",
    setupFiles: [`${dirname}.storybook/vrt.setup.ts`],
    testTimeout: 60000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      // The page stories are captured on, unless a story sets its own viewport.
      viewport: { width: 1200, height: 900 },
      screenshotFailures: false,
      expect: {
        toMatchScreenshot: {
          // A mismatch's screenshot and diff, where git doesn't look.
          resolveDiffPath: ({ root, testFileDirectory, testFileName, arg, browserName, platform, ext }) =>
            join(root, ".cache/vrt", testFileDirectory, testFileName, `${arg}-${browserName}-${platform}${ext}`)
        }
      }
    }
  }
})
const runsVisualRegression = process.argv.some(
  (arg, index, args) => arg === "--project=vrt" || (arg === "--project" && args[index + 1] === "vrt")
)

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Each database suite starts an embedded PostgreSQL instance. Bound concurrency independently of host core count.
    maxWorkers: 4,
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
          sequence: { groupOrder: 0 }
        }
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
      },
      ...(runsVisualRegression ? [visualRegression()] : [])
    ]
  }
})
