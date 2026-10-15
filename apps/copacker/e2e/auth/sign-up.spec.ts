import { randomBytes } from "node:crypto"
import { e2eWorkos } from "../../scripts/e2e-user"
import { expect, test, unique } from "../fixtures"
import { formReady } from "./hydrated"

// A brand-new account from sign-up to deleting it: the emailed code (read back from WorkOS, since example.net can't
// receive mail), getting started as a buyer, a second workspace, then deleting the workspace and the account in
// Settings. Whatever happens, the account and its WorkOS organizations are removed afterwards.

const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`
const email = `copacker-e2e+${suffix}@example.net`
const password = `Signup-${randomBytes(12).toString("base64url")}`
const organizations = new Set<string>()

// The code WorkOS emailed to the address, from its email_verification.created events.
async function verificationCode(since: string) {
  const workos = e2eWorkos()
  const { data: events } = await workos.events.listEvents({
    events: ["email_verification.created"],
    rangeStart: since,
    limit: 100
  })
  const event = events.find(
    (candidate) => candidate.event === "email_verification.created" && candidate.data.email === email
  )
  if (event?.event !== "email_verification.created") {
    return null
  }
  const { code } = await workos.userManagement.getEmailVerification(event.data.id)
  return code
}

// The WorkOS organizations the account belongs to, which deleting the account leaves behind.
async function rememberOrganizations() {
  const workos = e2eWorkos()
  const { data: users } = await workos.userManagement.listUsers({ email })
  for (const user of users) {
    const { data: memberships } = await workos.userManagement.listOrganizationMemberships({ userId: user.id })
    for (const membership of memberships) {
      organizations.add(membership.organizationId)
    }
  }
  return users
}

test.afterAll(async () => {
  const workos = e2eWorkos()
  for (const user of await rememberOrganizations()) {
    await workos.userManagement.deleteUser(user.id)
  }
  for (const id of organizations) {
    await workos.organizations.deleteOrganization(id).catch(() => undefined)
  }
})

test("a new account signs up, gets started as a buyer, and deletes itself", async ({ page }) => {
  test.slow()
  const company = unique("E2E Signup buyer")
  const supplier = unique("E2E Signup supplier")
  const since = new Date(Date.now() - 60_000).toISOString()

  await test.step("sign up", async () => {
    await page.goto("/signup")
    await formReady(page)
    await page.getByLabel("Work email").fill(email)
    await page.getByLabel("Password", { exact: true }).fill(password)
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(page).toHaveURL(/\/verify-email$/)
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
    await expect(page.getByText(`Enter the code we sent to ${email}.`)).toBeVisible()
    await expect(page.getByRole("button", { name: /^Send again in \d+s$/ })).toBeDisabled()
  })

  await test.step("verify the email", async () => {
    const field = page.getByLabel("Verification code")
    // A wrong code says so and clears for another try.
    await field.fill("000000")
    await expect(page.getByText("That code isn’t right. Check the email and try again.")).toBeVisible()
    await expect(field).toHaveValue("")

    let code: string | null = null
    await expect
      .poll(async () => (code = await verificationCode(since)), { timeout: 30_000, intervals: [1000, 2000, 3000] })
      .toMatch(/^\d{6}$/)
    // Six digits send themselves.
    await field.fill(code!)
    await expect(page).toHaveURL(/\/onboarding/)
  })

  await test.step("get started as a buyer", async () => {
    const main = page.getByRole("main")
    await expect(main.getByText("Step 1 of 4")).toBeVisible()
    await expect(main.getByRole("heading", { name: "About you" })).toBeVisible()
    await main.getByRole("button", { name: "Continue" }).click()
    await expect(main.getByText("Enter your first name")).toBeVisible()
    await expect(main.getByText("Enter your last name")).toBeVisible()
    await expect(main.getByText("Choose your position")).toBeVisible()

    await main.getByLabel("First name").fill("Sam")
    await main.getByLabel("Last name").fill("Signup")
    await main.getByRole("combobox", { name: "Position" }).click()
    await page.getByRole("option", { name: "Purchasing manager" }).click()
    await main.getByRole("button", { name: "Continue" }).click()

    await expect(main.getByText("Step 2 of 4")).toBeVisible()
    await expect(main.getByRole("heading", { name: "What does your company do?" })).toBeVisible()
    await main.getByRole("button", { name: "Continue" }).click()
    await expect(main.getByText("Choose one")).toBeVisible()
    await main.getByRole("radio", { name: /^Buyer/ }).click()
    await main.getByRole("button", { name: "Continue" }).click()

    await expect(main.getByText("Step 3 of 4")).toBeVisible()
    await expect(main.getByRole("heading", { name: "Your company" })).toBeVisible()
    // Buyers don't give a phone number.
    await expect(main.getByLabel("Phone number")).toHaveCount(0)
    await main.getByRole("button", { name: "Continue" }).click()
    await expect(main.getByText("Enter your company’s name")).toBeVisible()
    await main.getByLabel("Company name").fill(company)
    await main.getByLabel("Website").fill("example.net")
    await main.getByRole("button", { name: "Continue" }).click()

    await expect(main.getByText("Step 4 of 4")).toBeVisible()
    await expect(main.getByRole("heading", { name: "Delivery address" })).toBeVisible()
    // The address starts from what's known.
    await expect(main.getByLabel("Address name")).toHaveValue("Warehouse")
    await expect(main.getByLabel("Contact name")).toHaveValue("Sam Signup")
    await expect(main.getByRole("combobox", { name: "Country" })).toContainText("United States")
    await expect(main.getByRole("button", { name: "Skip for now" })).toBeVisible()

    // Back keeps what was typed.
    await main.getByRole("button", { name: "Back" }).click()
    await expect(main.getByText("Step 3 of 4")).toBeVisible()
    await expect(main.getByLabel("Company name")).toHaveValue(company)
    await main.getByRole("button", { name: "Continue" }).click()

    await main.getByLabel("Street address").fill("200 Signup Way")
    await main.getByLabel("City").fill("Portland")
    await main.getByRole("combobox", { name: "State or province" }).click()
    await page.getByRole("option", { name: "Oregon", exact: true }).click()
    await main.getByLabel("Postal code").fill("97201")
    await main.getByRole("button", { name: "Create workspace" }).click()

    await expect(page).toHaveURL(/\/overview$/)
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible()
    await expect(page.getByRole("button", { name: `${company}, switch workspace` })).toBeVisible()
  })

  await test.step("add a supplier workspace, skipping its address", async () => {
    await page.getByRole("button", { name: `${company}, switch workspace` }).click()
    await page.getByRole("menuitem", { name: "New workspace" }).click()
    await expect(page).toHaveURL(/\/workspaces\/new$/)
    const main = page.getByRole("main")
    // The profile is complete, so it starts from what the company does.
    await expect(main.getByText("Step 1 of 3")).toBeVisible()
    await main.getByRole("radio", { name: /^Supplier/ }).click()
    await main.getByRole("button", { name: "Continue" }).click()
    await main.getByLabel("Company name").fill(supplier)
    await main.getByRole("button", { name: "Continue" }).click()
    await expect(main.getByRole("heading", { name: "Pickup address" })).toBeVisible()
    await main.getByRole("button", { name: "Skip for now" }).click()

    await expect(page).toHaveURL(/\/orders$/)
    await expect(page.getByRole("button", { name: `${supplier}, switch workspace` })).toBeVisible()
    await rememberOrganizations()
    expect(organizations.size).toBe(2)
  })

  await test.step("delete the supplier workspace", async () => {
    await page.goto("/settings")
    await page.getByRole("button", { name: "Delete workspace" }).click()
    const dialog = page.getByRole("alertdialog", { name: `Delete ${supplier}?` })
    const confirm = dialog.getByRole("button", { name: "Delete workspace" })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel("Workspace name").fill(supplier)
    await confirm.click()
    // The buyer workspace is what's left.
    await expect(page).toHaveURL(/\/overview$/)
    await expect(page.getByRole("button", { name: `${company}, switch workspace` })).toBeVisible()
  })

  await test.step("delete the account", async () => {
    await page.goto("/settings")
    await page.getByRole("button", { name: "Delete account" }).click()
    const dialog = page.getByRole("alertdialog", { name: "Delete your account?" })
    await expect(dialog.getByText(`${company} closes with your account.`)).toBeVisible()
    const confirm = dialog.getByRole("button", { name: "Delete account" })
    await dialog.getByLabel("Your email").fill("someone-else@example.net")
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel("Your email").fill(email)
    await confirm.click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Restocking, handled.")
    await page.goto("/overview")
    await expect(page).toHaveURL(/\/login\?next=%2Foverview$/)
    const { data: users } = await e2eWorkos().userManagement.listUsers({ email })
    expect(users).toEqual([])
  })
})
