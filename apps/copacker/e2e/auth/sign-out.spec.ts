import { e2eEmail } from "../../scripts/e2e-user"
import { expect, signIn, switchWorkspace, test } from "../fixtures"

// Its own browser, signed in afresh, so signing out doesn't end a session the role pages carry forward.
test("signing out from the user menu ends the session", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: "en-US" })
  const site = new URL(baseURL ?? "http://127.0.0.1").origin
  try {
    const page = await context.newPage()
    await signIn(page)
    await switchWorkspace(page, "buyer")
    await expect(page.getByRole("button", { name: /, switch workspace$/ })).toBeVisible()

    await page.getByRole("button", { name: /, account$/ }).click()
    await expect(page.getByRole("menu").getByText(e2eEmail)).toBeVisible()
    const workosLogout = page.waitForRequest(
      (request) => new URL(request.url()).hostname.endsWith("workos.com") && request.url().includes("logout")
    )
    await page.getByRole("menuitem", { name: "Sign out" }).click()
    await workosLogout
    await expect(page).toHaveURL((url) => url.origin === site && url.pathname === "/")

    await page.goto("/settings")
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === "/settings")
    const cookies = await context.cookies(site)
    expect(cookies.map((cookie) => cookie.name)).not.toContain("wos-session")
  } finally {
    await context.close()
  }
})
