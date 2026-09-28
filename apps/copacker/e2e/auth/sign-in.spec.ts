import { e2eEmail, e2ePassword } from "../../scripts/e2e-user"
import { expect, test } from "../fixtures"
import { formReady } from "./hydrated"

// An address with no account, so a failed attempt never counts against the test account.
const nobody = () => `copacker-e2e+nobody-${Date.now().toString(36)}@example.net`

test.describe("signed out", () => {
  test("a protected page sends you to sign in and back again", async ({ page }) => {
    await page.goto("/orders?status=draft")
    await expect(page).toHaveURL(
      (url) => url.pathname === "/login" && url.searchParams.get("next") === "/orders?status=draft"
    )
    await expect(page.getByRole("heading", { name: "Sign in to Copacker" })).toBeVisible()
    // The way to an account keeps the page to come back to.
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      `/signup?${new URLSearchParams({ next: "/orders?status=draft" })}`
    )

    await formReady(page)
    await page.getByLabel("Email").fill(e2eEmail)
    await page.getByLabel("Password", { exact: true }).fill(e2ePassword())
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === "/orders" && url.search === "?status=draft")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  })

  test("every portal page asks you to sign in", { tag: "@smoke" }, async ({ page }) => {
    for (const path of ["/overview", "/settings", "/partners", "/shipments", "/workspaces/new", "/onboarding"]) {
      await page.goto(path)
      await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === path)
    }
  })

  test("a wrong password says so and keeps the email", { tag: "@smoke" }, async ({ page }) => {
    const email = nobody()
    await page.goto("/login")
    await formReady(page)
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password", { exact: true }).fill("not-the-password-1")
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(page.getByText("Incorrect email or password.")).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel("Email")).toHaveValue(email)
  })

  test("sign-in checks the fields before sending", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/login")
    await formReady(page)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(page.getByText("Enter an email address")).toBeVisible()
    await expect(page.getByText("Enter your password")).toBeVisible()

    // "Forgot password?" carries the email typed so far.
    await page.getByLabel("Email").fill("casey@example.net")
    await page.getByRole("link", { name: "Forgot password?" }).click()
    await expect(page).toHaveURL(/\/forgot-password\?email=casey%40example\.net$/)
    await expect(page.getByLabel("Email")).toHaveValue("casey@example.net")
  })

  test("Google and Microsoft go through Copacker's own routes", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/login?next=%2Fshipments")
    const google = page.getByRole("button", { name: "Continue with Google" })
    const microsoft = page.getByRole("button", { name: "Continue with Microsoft" })
    await expect(google).toHaveAttribute("href", "/login/google?next=%2Fshipments")
    await expect(microsoft).toHaveAttribute("href", "/login/microsoft?next=%2Fshipments")
    await expect(page.getByText("or", { exact: true })).toBeVisible()

    await page.goto("/signup")
    await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/login/google?next=%2F"
    )
  })

  test("an unknown sign-in provider isn't found", { tag: "@smoke" }, async ({ request }) => {
    const response = await request.get("/login/myspace", { maxRedirects: 0 })
    expect(response.status()).toBe(404)
  })

  test("a failed provider sign-in shows the error", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/login?error=access_denied")
    await expect(page.getByText("Couldn’t sign in with that account. Try again.")).toBeVisible()
  })

  test("sign-up checks the email and password without making an account", { tag: "@smoke" }, async ({ page }) => {
    const actions: string[] = []
    page.on("request", (request) => {
      if (request.url().includes("/api/action")) {
        actions.push(request.url())
      }
    })
    await page.goto("/signup")
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible()
    const email = page.getByLabel("Work email")
    const password = page.getByLabel("Password", { exact: true })
    await expect(page.getByText("At least 10 characters")).toBeVisible()
    // The password can be shown while typing it.
    await expect(password).toHaveAttribute("type", "password")
    await formReady(page)
    await expect(password).toHaveAttribute("type", "text")

    await page.getByRole("button", { name: "Create account" }).click()
    await expect(page.getByText("Enter an email address")).toBeVisible()
    await expect(page.getByText("Use at least 10 characters")).toBeVisible()

    await email.fill("casey.example.net")
    await password.fill("short")
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(page.getByText("Enter an email address")).toBeVisible()
    await expect(page.getByText("Use at least 10 characters")).toBeVisible()
    await expect(email).toHaveAttribute("aria-invalid", "true")
    await expect(password).toHaveAttribute("aria-invalid", "true")
    await expect(password).toHaveValue("short")

    await email.fill("casey@example.net")
    await expect(page.getByText("Enter an email address")).toBeHidden()
    await password.fill("long enough now")
    await expect(page.getByText("Use at least 10 characters")).toBeHidden()
    expect(actions).toEqual([])

    await page.getByRole("link", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test("forgot password confirms without saying whether the account exists", { tag: "@smoke" }, async ({ page }) => {
    const email = nobody()
    await page.goto("/forgot-password")
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible()
    // Until the page is live a click submits natively and reloads it, so it's repeated until the check shows.
    await expect(async () => {
      await page.getByRole("button", { name: "Send reset link" }).click()
      await expect(page.getByText("Enter an email address")).toBeVisible({ timeout: 1000 })
    }).toPass()

    await page.getByLabel("Email").fill(email)
    await page.getByRole("button", { name: "Send reset link" }).click()
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
    await expect(page.getByText(`If ${email} has an account, a reset link is on its way.`)).toBeVisible()
    await page.getByRole("button", { name: "Back to sign in" }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test("a reset link without its token is incomplete", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/reset-password")
    await expect(page.getByRole("heading", { name: "This link is incomplete" })).toBeVisible()
    await expect(page.getByText("Open the link from the email again, or ask for a new one.")).toBeVisible()
    await page.getByRole("button", { name: "Send a new link" }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
  })

  test("a reset link with a token asks for the new password", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/reset-password?token=not-a-real-token")
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible()
    await formReady(page)
    await page.getByRole("button", { name: "Save and sign in" }).click()
    await expect(page.getByText("Use at least 10 characters")).toBeVisible()
  })

  test("the code page without a sign-in waiting goes to sign in", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/verify-email")
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole("heading", { name: "Sign in to Copacker" })).toBeVisible()
  })

  for (const kind of ["team", "supplier", "forwarder"]) {
    test(`an invalid ${kind} invitation says so`, { tag: "@smoke" }, async ({ page }) => {
      await page.goto(`/invite?token=${"x".repeat(32)}&kind=${kind}`)
      await expect(page.getByRole("heading", { name: "This invitation isn’t valid" })).toBeVisible()
      await expect(page.getByText("It was used already, or a newer one replaced it.")).toBeVisible()
      await page.getByRole("button", { name: "Sign in" }).click()
      await expect(page).toHaveURL(/\/login$/)
    })
  }

  test("an invitation link without a token isn't valid", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/invite")
    await expect(page.getByRole("heading", { name: "This invitation isn’t valid" })).toBeVisible()
  })
})

test.describe("signed in", () => {
  test.use({ role: "buyer" })

  test("sign-in and sign-up pages go home", async ({ page }) => {
    await page.goto("/login")
    await expect(page).toHaveURL(/\/overview$/)
    await page.goto("/signup")
    await expect(page).toHaveURL(/\/overview$/)
    // A page to return to is honored.
    await page.goto("/login?next=%2Fpartners")
    await expect(page).toHaveURL(/\/partners$/)
  })

  test("an invalid invitation offers to open Copacker", async ({ page }) => {
    await page.goto(`/invite?token=${"y".repeat(32)}&kind=team`)
    await expect(page.getByRole("heading", { name: "This invitation isn’t valid" })).toBeVisible()
    await page.getByRole("button", { name: "Open Copacker" }).click()
    await expect(page).toHaveURL(/\/overview$/)
  })
})
