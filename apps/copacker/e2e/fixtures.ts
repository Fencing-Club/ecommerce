import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { type Browser, type BrowserContext, expect, type Page, test as base } from "@playwright/test"
import { e2eEmail, e2ePassword, e2eUser } from "../scripts/e2e-user"

// The seeded workspaces the test account owns (scripts/seed-e2e.ts).
export const workspaces = {
  buyer: "E2E Buyer",
  supplier: "E2E Supplier",
  forwarder: "E2E Forwarder"
} as const
export type Role = keyof typeof workspaces

// Whether the suite runs against a deployed site, where a worker runs jobs and the stores are real services.
const target = process.env.E2E_BASE_URL ? new URL(process.env.E2E_BASE_URL) : undefined
export const deployed = Boolean(
  target &&
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
  !target.hostname.endsWith(".local.copacker.ai")
)

// A name no other run or test uses, for records a test makes.
export function unique(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// Opens the top bar's workspace menu and switches to the role's workspace, which reloads the portal.
export async function switchWorkspace(page: Page, role: Role) {
  await expect(page.locator("[data-slot=sidebar-wrapper]")).toHaveAttribute("data-portal-hydrated", "true")
  const switcher = page.getByRole("button", { name: /, switch workspace$/ })
  await switcher.click()
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith("/api/action") && response.request().method() === "POST"
    ),
    page.getByRole("menuitem", { name: new RegExp(`^${workspaces[role]}`) }).click()
  ])
  await expect(switcher).toHaveAccessibleName(`${workspaces[role]}, switch workspace`)
}

export async function signIn(page: Page, password = e2ePassword()) {
  await waitForHydration(page)
  await page.goto("/login")
  await page.getByLabel("Email").fill(e2eEmail)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"))
}

// Signs in and opens the role's workspace, and saves the browser's cookies to the file.
async function saveSession(browser: Browser, baseURL: string | undefined, role: Role, file: string) {
  // Signed out: inside a test, a new context would otherwise start from the test's own storage state.
  const context = await browser.newContext({ baseURL, locale: "en-US", storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await signIn(page)
  if (page.url().includes("/login")) {
    // The account's password was changed by hand; set it back and try again.
    await e2eUser({ reset: true })
    await signIn(page)
  }
  await expect(page).not.toHaveURL(/\/onboarding/)
  await switchWorkspace(page, role)
  await context.storageState({ path: file })
  await context.close()
}

// Each worker signs in once per role and carries the session forward from test to test: AuthKit rotates the refresh
// token whenever the access token expires, so a test must start from the cookies the previous one ended with.
function sessionFile(role: Role, project: string, worker: number) {
  const directory = process.env.E2E_AUTH_DIR ?? path.join(import.meta.dirname, ".auth")
  mkdirSync(directory, { recursive: true })
  return path.join(directory, `${role}-${project}-${worker}.json`)
}

type Fixtures = {
  // The workspace a spec runs in, signed in; null runs it signed out.
  role: Role | null
  stateFile: string | undefined
  // Opens another signed-in page in the given workspace, for a scenario that goes back and forth between partners.
  pageFor: (role: Role) => Promise<Page>
}

// Browser actions can otherwise beat streamed SSR hydration. Wait for the app's readiness signal on every document,
// including auth redirects and reloads, without arbitrary delays or waiting for unrelated network activity.
async function waitForHydration(page: Page) {
  await page.addLocatorHandler(
    page.locator("html:not([data-hydrated]), [data-slot=sidebar-wrapper]:not([data-portal-hydrated])").first(),
    async () => {
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true")
      await expect(page.locator("[data-slot=sidebar-wrapper]:not([data-portal-hydrated])")).toHaveCount(0)
    },
    { noWaitAfter: true }
  )
}

export const test = base.extend<Fixtures>({
  page: async ({ page }, provide) => {
    await waitForHydration(page)
    await provide(page)
  },
  role: [null, { option: true }],
  stateFile: async ({ role, browser, baseURL }, provide, testInfo) => {
    if (!role) {
      await provide(undefined)
      return
    }
    const file = sessionFile(role, testInfo.project.name, testInfo.parallelIndex)
    if (!existsSync(file)) {
      await saveSession(browser, baseURL, role, file)
    }
    await provide(file)
  },
  storageState: async ({ stateFile }, provide) => {
    await provide(stateFile)
  },
  context: async ({ context, stateFile }, provide) => {
    await provide(context)
    if (stateFile) {
      await context.storageState({ path: stateFile })
    }
  },
  pageFor: async ({ browser, baseURL, locale, timezoneId, viewport, isMobile, hasTouch }, provide, testInfo) => {
    const opened: Array<{ context: BrowserContext; file: string }> = []
    await provide(async (role) => {
      const file = sessionFile(role, testInfo.project.name, testInfo.parallelIndex)
      if (!existsSync(file)) {
        await saveSession(browser, baseURL, role, file)
      }
      const context = await browser.newContext({
        baseURL,
        locale,
        timezoneId,
        viewport,
        isMobile,
        hasTouch,
        storageState: file
      })
      opened.push({ context, file })
      const page = await context.newPage()
      await waitForHydration(page)
      return page
    })
    for (const { context, file } of opened) {
      await context.storageState({ path: file })
      await context.close()
    }
  }
})

export { expect }
