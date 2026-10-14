import type { Page } from "@playwright/test"
import { deployed, expect, test, unique } from "../fixtures"

test.use({ role: "buyer" })

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true })

test.beforeEach(async ({ page }) => {
  await page.goto("/settings")
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible()
})

test("lists every settings section for the owner", async ({ page }) => {
  for (const name of [
    "Profile",
    "Language",
    "Team",
    "Integrations",
    "Restock",
    "Time zone",
    "Monthly costs",
    "Addresses",
    "Delete"
  ]) {
    await expect(page.getByRole("heading", { name, level: 2, exact: true })).toBeVisible()
  }
  await expect(section(page, "Profile").getByText("copacker-e2e@example.net")).toBeVisible()
})

test("edits the profile and puts it back", async ({ page }) => {
  const profile = section(page, "Profile")
  const position = profile.getByRole("combobox", { name: "Position" })
  const website = profile.getByRole("textbox", { name: "Company website" })
  const save = profile.getByRole("button", { name: "Save" })
  // The seeded profile, put back at the end.
  const before = { position: "Operations manager", website: "" }
  await expect(save).toBeDisabled()

  // A required field left empty says so and isn't saved.
  await profile.getByRole("textbox", { name: "Company", exact: true }).fill("")
  await save.click()
  await expect(profile.getByText("Enter your company")).toBeVisible()
  await profile.getByRole("textbox", { name: "Company", exact: true }).fill("E2E Buyer")

  await position.click()
  await page.getByRole("option", { name: "Purchasing manager" }).click()
  await website.fill("e2e-buyer.example.net")
  await save.click()
  await expect(profile.getByText("Saved")).toBeVisible()

  // The saved scheme appears beside the editable domain, just like onboarding.
  await page.reload()
  await expect(position).toHaveText(/^Purchasing manager/)
  await expect(profile.getByText("https://", { exact: true })).toBeVisible()
  await expect(website).toHaveValue("e2e-buyer.example.net")

  await position.click()
  await page.getByRole("option", { name: before.position, exact: true }).click()
  await website.fill(before.website)
  await save.click()
  await expect(profile.getByText("Saved")).toBeVisible()
  await page.reload()
  await expect(position).toHaveText(/^Operations manager/)
})

test("saves a chosen language and goes back to the system language", async ({ page }) => {
  const language = section(page, "Language")
  const select = language.getByRole("combobox", { name: "Language" })
  await expect(select).toHaveText(/^System \(English\)/)

  // The language is saved for the person in every workspace, and other specs run at the same time in English, so this
  // saves English by name, then System again, rather than switching this account's pages to another language.
  await select.click()
  await expect(page.getByRole("option", { name: "Deutsch" })).toBeVisible()
  await page.getByRole("option", { name: "English", exact: true }).click()
  await language.getByRole("button", { name: "Save" }).click()
  await expect(language.getByText("Saved")).toBeVisible()
  await page.reload()
  await expect(select).toHaveText(/^English/)
  await select.click()
  await page.getByRole("option", { name: "System (English)" }).click()
  await language.getByRole("button", { name: "Save" }).click()
  await expect(language.getByText("Saved")).toBeVisible()
  await page.reload()
  await expect(select).toHaveText(/^System \(English\)/)
})

test("invites a colleague, sends the invitation again and cancels it", async ({ page }) => {
  test.skip(deployed, "Sending an invitation emails it on staging")
  const team = section(page, "Team")
  const email = `${unique("colleague").replace(" ", "-")}@example.net`
  await team.getByRole("button", { name: "Invite" }).click()
  const dialog = page.getByRole("dialog", { name: "Invite to E2E Buyer" })
  await expect(dialog).toBeVisible()

  // Nothing filled in: an email and, for a member, a page are asked for.
  await dialog.getByRole("button", { name: "Send invitation" }).click()
  await expect(dialog.getByText("Enter an email address")).toBeVisible()
  await expect(dialog.getByText("Choose at least one page")).toBeVisible()

  await dialog.getByRole("textbox", { name: "Email" }).fill(email)
  await expect(dialog.getByRole("radio", { name: "Member" })).toBeChecked()
  await dialog.getByRole("combobox", { name: "Products" }).click()
  await page.getByRole("option", { name: "Edit" }).click()
  await dialog.getByRole("combobox", { name: "Restock" }).click()
  await page.getByRole("option", { name: "View" }).click()
  await expect(dialog.getByText("Choose at least one page")).toBeHidden()
  await dialog.getByRole("button", { name: "Send invitation" }).click()
  await expect(dialog).toBeHidden()

  const row = team.getByRole("listitem").filter({ hasText: email })
  await expect(row.getByText(/^Invitation sent, expires /)).toBeVisible()
  await expect(row.getByText("Member", { exact: true })).toBeVisible()

  await row.getByRole("button", { name: `More for ${email}` }).click()
  await page.getByRole("menuitem", { name: "Send again" }).click()
  await expect(row.getByText(/^Invitation sent, expires /)).toBeVisible()
  await page.reload()
  await expect(row.getByText(/^Invited, expires /)).toBeVisible()

  await row.getByRole("button", { name: `More for ${email}` }).click()
  await page.getByRole("menuitem", { name: "Cancel invitation" }).click()
  await expect(row).toBeHidden()
})

test("checks the restock settings and saves them", async ({ page }) => {
  const restock = section(page, "Restock")
  const sales = restock.getByRole("spinbutton", { name: "Sales period (days)" })
  const lead = restock.getByRole("spinbutton", { name: "Lead time (days)" })
  const save = restock.getByRole("button", { name: "Save" })
  const before = { sales: await sales.inputValue(), lead: await lead.inputValue() }

  // Empty, or outside 1 to 730 days, isn't saved, and each says what's wrong.
  await sales.fill("")
  await lead.fill("731")
  await save.click()
  await expect(restock.getByText("Enter the days")).toBeVisible()
  await expect(restock.getByText("Enter 730 or less")).toBeVisible()
  await sales.fill("0")
  await lead.fill("30")
  await expect(restock.getByText("Enter 1 or more")).toBeVisible()
  await expect(restock.getByText("Enter the days")).toBeHidden()
  await expect(restock.getByText("Enter 730 or less")).toBeHidden()

  // Saved and restored at once: Restock and the Overview read these, and their specs may be running.
  await sales.fill("45")
  await lead.fill("30")
  await save.click()
  await expect(restock.getByText("Saved")).toBeVisible()
  await page.reload()
  await expect(sales).toHaveValue("45")
  await expect(lead).toHaveValue("30")

  await sales.fill(before.sales)
  await lead.fill(before.lead)
  await save.click()
  await expect(restock.getByText("Saved")).toBeVisible()
  await page.reload()
  await expect(sales).toHaveValue(before.sales)
  await expect(lead).toHaveValue(before.lead)
})

test("chooses a store time zone and goes back to automatic", async ({ page }) => {
  const zone = section(page, "Time zone")
  const select = zone.getByRole("combobox", { name: "Store time zone" })
  // A run that stopped halfway may have left Chicago chosen.
  const [city, zoneName] = (await select.textContent())?.includes("Chicago")
    ? ["Denver", /America\/Denver/]
    : ["Chicago", /America\/Chicago/]
  await select.click()
  await page.getByRole("option", { name: new RegExp(`^${city}`) }).click()
  await expect(select).toHaveText(zoneName)
  await zone.getByRole("button", { name: "Save" }).click()
  await expect(zone.getByText("Saved")).toBeVisible()
  await page.reload()
  await expect(select).toHaveText(zoneName)

  await select.click()
  await page.getByRole("option", { name: /^Automatic/ }).click()
  await zone.getByRole("button", { name: "Save" }).click()
  await expect(zone.getByText("Saved")).toBeVisible()
  await page.reload()
  await expect(select).toHaveText(/^Automatic, America\/Los Angeles/)
})

test("adds a monthly cost and removes it", async ({ page }) => {
  const costs = section(page, "Monthly costs")
  const name = unique("Warehouse rent")
  await costs.getByRole("button", { name: "Add cost" }).click()
  const dialog = page.getByRole("dialog", { name: "Add monthly cost" })

  await dialog.getByRole("button", { name: "Add cost" }).click()
  await expect(dialog.getByText("Enter a name")).toBeVisible()
  await expect(dialog.getByText("Enter the amount")).toBeVisible()

  await dialog.getByRole("textbox", { name: "Name" }).fill(name)
  await dialog.getByRole("textbox", { name: "Amount a month" }).fill("125")
  await dialog.getByRole("combobox", { name: "Channel" }).click()
  await page.getByRole("option", { name: "Shopify" }).click()
  await dialog.getByLabel("Paid since").fill("2026-03-01")
  await dialog.getByLabel("Paid until").fill("2026-02-01")
  await dialog.getByRole("button", { name: "Add cost" }).click()
  await expect(dialog.getByText("The end date can’t be before the start date")).toBeVisible()
  await dialog.getByLabel("Paid until").fill("2026-12-31")
  await dialog.getByRole("button", { name: "Add cost" }).click()
  await expect(dialog).toBeHidden()

  const row = costs.getByRole("listitem").filter({ hasText: name })
  await expect(row.getByText("$125.00")).toBeVisible()
  await expect(row.getByText("Shopify, Mar 1, 2026 to Dec 31, 2026")).toBeVisible()

  await row.getByRole("button", { name: `More for ${name}` }).click()
  await page.getByRole("menuitem", { name: "Remove" }).click()
  await expect(row).toBeHidden()
})

test("adds a delivery address, edits it and removes it", async ({ page }) => {
  const addresses = section(page, "Addresses")
  const name = unique("Overflow warehouse")
  await addresses.getByRole("button", { name: "Add address" }).click()
  const dialog = page.getByRole("dialog", { name: "Add address" })

  await dialog.getByRole("button", { name: "Save address" }).click()
  for (const field of ["Address name", "Contact name", "Street address", "City", "State or province", "Postal code"]) {
    await expect(dialog.getByRole("textbox", { name: field })).toHaveAttribute("aria-invalid", "true")
  }
  await expect(dialog.getByRole("combobox", { name: "Country" })).toHaveAttribute("aria-invalid", "true")

  await dialog.getByRole("textbox", { name: "Address name" }).fill(name)
  await dialog.getByRole("textbox", { name: "Contact name" }).fill("Robin Receiver")
  await dialog.getByRole("textbox", { name: "Phone number" }).fill("+1 503 555 0199")
  await dialog.getByRole("textbox", { name: "Email" }).fill("receiving@example.net")
  await dialog.getByRole("textbox", { name: "Street address" }).fill("200 Dock Road")
  await dialog.getByRole("textbox", { name: "Address line 2" }).fill("Door 4")
  await dialog.getByRole("textbox", { name: "City" }).fill("Portland")
  await dialog.getByRole("textbox", { name: "State or province" }).fill("OR")
  await dialog.getByRole("textbox", { name: "Postal code" }).fill("97201")
  await dialog.getByRole("combobox", { name: "Country" }).click()
  await page.getByRole("option", { name: "United States", exact: true }).click()
  await dialog.getByRole("button", { name: "Save address" }).click()
  await expect(dialog).toBeHidden()

  const row = addresses.getByRole("listitem").filter({ hasText: name })
  await expect(row.getByText("200 Dock Road, Door 4, Portland, OR 97201, US")).toBeVisible()
  await expect(row.getByText("Robin Receiver")).toBeVisible()
  await expect(row.getByRole("link", { name: "receiving@example.net" })).toBeVisible()

  await row.getByRole("button", { name: `More for ${name}` }).click()
  await page.getByRole("menuitem", { name: "Edit" }).click()
  const edit = page.getByRole("dialog", { name: "Edit address" })
  await expect(edit.getByRole("textbox", { name: "Address name" })).toHaveValue(name)
  await edit.getByRole("textbox", { name: "City" }).fill("")
  await edit.getByRole("button", { name: "Save changes" }).click()
  await expect(edit.getByRole("textbox", { name: "City" })).toHaveAttribute("aria-invalid", "true")
  await edit.getByRole("textbox", { name: "City" }).fill("Beaverton")
  await edit.getByRole("textbox", { name: "Postal code" }).fill("97005")
  await edit.getByRole("button", { name: "Save changes" }).click()
  await expect(edit).toBeHidden()
  await expect(row.getByText("200 Dock Road, Door 4, Beaverton, OR 97005, US")).toBeVisible()

  await row.getByRole("button", { name: `More for ${name}` }).click()
  await page.getByRole("menuitem", { name: "Remove" }).click()
  await expect(row).toBeHidden()
})

test("shows Shopify connected and edits its excluded order tags", async ({ page }) => {
  const integrations = section(page, "Integrations")
  const shopify = integrations.getByRole("button", { name: "Shopify settings" })
  await expect(shopify).toContainText("Connected")
  await expect(shopify).toContainText("copacker-demo.myshopify.com")
  // Amazon and eBay offer Connect; neither is clicked. Without their apps configured, as locally and in CI, Amazon's
  // goes to Seller Central's consent and eBay isn't available yet. Staging's draft Amazon app connects in a dialog.
  const amazon = /^Amazon .*Connect$/
  if (deployed) {
    await expect(
      integrations.getByRole("link", { name: amazon }).or(integrations.getByRole("button", { name: amazon }))
    ).toBeVisible()
  } else {
    await expect(integrations.getByRole("link", { name: amazon })).toHaveAttribute("href", "/api/connections/amazon")
    await expect(integrations.getByText("Coming soon")).toBeVisible()
  }

  await shopify.click()
  const sheet = page.getByRole("dialog", { name: "Shopify" })
  await expect(sheet.getByText("copacker-demo.myshopify.com")).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Disconnect" })).toBeVisible()

  // Tags are shared by every spec reading the Overview, so this one is unlikely to match anything and is removed again.
  const tag = unique("e2e-skip").replace(" ", "-")
  await sheet.getByRole("button", { name: "Edit excluded order tags" }).click()
  const tags = page.getByRole("dialog", { name: "Excluded order tags" })
  await tags.getByRole("textbox", { name: "Tags" }).fill(tag)
  await tags.getByRole("textbox", { name: "Tags" }).press("Enter")
  await expect(tags.getByRole("button", { name: `Remove ${tag}` })).toBeVisible()
  await tags.getByRole("button", { name: "Save" }).click()
  await expect(tags).toBeHidden()
  await expect(sheet.getByText(tag)).toBeVisible()

  await sheet.getByRole("button", { name: "Edit excluded order tags" }).click()
  await tags.getByRole("button", { name: `Remove ${tag}` }).click()
  await tags.getByRole("button", { name: "Save" }).click()
  await expect(tags).toBeHidden()
  await expect(sheet.getByText(tag)).toBeHidden()

  // The inventory locations dialog opens with the store's locations, and closes unchanged.
  await sheet.getByRole("button", { name: "Edit inventory locations" }).click()
  const locations = page.getByRole("dialog", { name: "Inventory locations" })
  await expect(locations.getByRole("checkbox", { name: "Warehouse" })).toBeChecked()
  await expect(locations.getByRole("button", { name: "Save" })).toBeDisabled()
  await locations.getByRole("button", { name: "Cancel" }).click()
  await expect(locations).toBeHidden()

  // Sync now is in the orders row's menu. Locally it only queues a job that never runs, so it isn't clicked.
  await sheet.getByRole("button", { name: "Shopify orders actions" }).click()
  await expect(page.getByRole("menuitem", { name: /^(Sync now|Syncing…)$/ })).toBeVisible()
  await page.keyboard.press("Escape")
})

test("keeps Delete workspace disabled until the name is typed", async ({ page }) => {
  const danger = section(page, "Delete")
  await danger.getByRole("button", { name: "Delete workspace" }).click()
  const dialog = page.getByRole("alertdialog", { name: "Delete E2E Buyer?" })
  const field = dialog.getByRole("textbox", { name: "Workspace name" })
  const confirm = dialog.getByRole("button", { name: "Delete workspace" })
  await expect(dialog.getByText("Its purchase orders, products, connections, and team are deleted")).toBeVisible()
  await expect(confirm).toBeDisabled()
  await field.fill("E2E Buye")
  await expect(confirm).toBeDisabled()
  await field.fill("E2E Buyer")
  await expect(confirm).toBeEnabled()
  // Never deleted: the seeded workspace is shared by every spec.
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible()
})
