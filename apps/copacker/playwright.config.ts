import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { playwrightServer } from "@buildkitgg/dev-domains/playwright"
import { defineConfig, devices } from "@playwright/test"
import { localAppEnvironment } from "./scripts/dev-environment"

// A local run reads the app's .env for WORKOS_API_KEY, which the test account's password is derived from.
if (existsSync(".env")) {
  process.loadEnvFile(".env")
}

// The suite runs against a local production build by default, which Playwright starts (E2E_DEV=1 uses the dev server).
// E2E_BASE_URL points it at a deployed site instead, such as staging after a deploy. See docs/e2e.md.
const deployed = process.env.E2E_BASE_URL
const port = Number(process.env.E2E_PORT ?? 3005)
const ci = Boolean(process.env.CI)
const local = !deployed && !ci ? await playwrightServer("e2e", fileURLToPath(new URL(".", import.meta.url))) : undefined
const baseURL = deployed ?? local?.use.baseURL ?? `http://127.0.0.1:${port}`
if (!deployed) {
  Object.assign(process.env, localAppEnvironment(baseURL))
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "./e2e/.results",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 2 : 0,
  workers: ci ? 3 : 4,
  reporter: ci ? [["github"], ["html", { outputFolder: "e2e/.report", open: "never" }]] : [["list"]],
  use: {
    baseURL,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 45_000
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Phones see the collapsed navigation; the specs tagged @mobile check it.
    { name: "mobile", grep: /@mobile/, use: { ...devices["Pixel 7"] } }
  ],
  webServer: deployed
    ? undefined
    : {
        ...local?.webServer,
        command:
          local?.webServer.command ??
          `pnpm exec vite ${process.env.E2E_DEV ? "dev" : "preview"} --host 127.0.0.1 --port ${port} --strictPort --mode e2e`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: "pipe"
      }
})
