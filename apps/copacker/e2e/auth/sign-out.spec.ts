import { e2eEmail } from "../../scripts/e2e-user"
import { expect, signIn, test } from "../fixtures"

// Its own browser, signed in afresh, so signing out doesn't end a session the role pages carry forward.
test("signing out from the user menu ends the session", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: "en-US" })
  const site = new URL(baseURL ?? "http://127.0.0.1").origin
  // WorkOS ends its session, then sends the browser to the environment's sign-out address, which for a local run is
  // another port's dev server. Only WorkOS and the site under test are let through.
  await context.route(
    (url) => url.origin !== site && !url.hostname.endsWith("workos.com"),
    (route) => route.fulfill({ contentType: "text/html", body: "<title>Signed out</title>" })
  )
  try {
    const page = await context.newPage()
    await signIn(page)
    await expect(page.getByRole("link", { name: "Copacker" })).toBeVisible()

    await page.getByRole("button", { name: new RegExp(e2eEmail.replace(/[.+]/g, "\\$&")) }).click()
    const workosLogout = page.waitForRequest(
      (request) => new URL(request.url()).hostname.endsWith("workos.com") && request.url().includes("logout")
    )
    await page.getByRole("menuitem", { name: "Sign out" }).click()
    await workosLogout
    await expect(page).not.toHaveURL(/\/(overview|orders)$/)

    await page.goto("/settings")
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === "/settings")
    const cookies = await context.cookies(site)
    expect(cookies.map((cookie) => cookie.name)).not.toContain("wos-session")
  } finally {
    await context.close()
  }
})
