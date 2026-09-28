import type { Page } from "@playwright/test"
import { expect, test, unique } from "../fixtures"

test.use({ role: "supplier" })

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true })

test.beforeEach(async ({ page }) => {
  await page.goto("/settings")
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible()
})

test("shows a supplier's settings without the buyer's", { tag: "@mobile" }, async ({ page }) => {
  for (const name of ["Profile", "Language", "Team", "Supplier profile", "Pickup addresses", "Delete"]) {
    await expect(page.getByRole("heading", { name, level: 2, exact: true })).toBeVisible()
  }
  for (const name of ["Integrations", "Restock", "Time zone", "Monthly costs", "Addresses"]) {
    await expect(page.getByRole("heading", { name, level: 2, exact: true })).toBeHidden()
  }
  await expect(section(page, "Pickup addresses").getByText("Where carriers collect your cartons")).toBeVisible()
})

test("edits the supplier profile and puts it back", async ({ page }) => {
  const profile = section(page, "Supplier profile")
  const fields = {
    contactName: profile.getByRole("textbox", { name: "Contact name" }),
    contactEmail: profile.getByRole("textbox", { name: "Contact email" }),
    phone: profile.getByRole("textbox", { name: "Phone" }),
    website: profile.getByRole("textbox", { name: "Website" })
  }
  const save = profile.getByRole("button", { name: "Save" })
  // What the seed gives the supplier, which the test puts back.
  const before = {
    contactName: "Casey Tester",
    contactEmail: "copacker-e2e@example.net",
    phone: "+1 206 555 0100",
    website: ""
  }
  await expect(save).toBeDisabled()

  // Each field checks what's typed before saving.
  await fields.contactEmail.fill("not an email")
  await fields.phone.fill("call me")
  await fields.website.fill("not a website")
  await save.click()
  await expect(profile.getByText("Enter an email address")).toBeVisible()
  await expect(profile.getByText("Enter a phone number")).toBeVisible()
  await expect(profile.getByText("Enter a website, such as example.com")).toBeVisible()

  await fields.contactName.fill("Robin Packer")
  await fields.contactEmail.fill("robin@e2e-supplier.example.net")
  await fields.phone.fill("+1 206 555 0199")
  await fields.website.fill("e2e-supplier.example.net")
  await save.click()
  await expect(profile.getByText("Saved")).toBeVisible()

  // The website is saved with its https://.
  await page.reload()
  await expect(fields.contactName).toHaveValue("Robin Packer")
  await expect(fields.contactEmail).toHaveValue("robin@e2e-supplier.example.net")
  await expect(fields.website).toHaveValue("https://e2e-supplier.example.net")

  await fields.contactName.fill(before.contactName)
  await fields.contactEmail.fill(before.contactEmail)
  await fields.phone.fill(before.phone)
  await fields.website.fill(before.website)
  await save.click()
  await expect(profile.getByText("Saved")).toBeVisible()
  await page.reload()
  await expect(fields.contactName).toHaveValue(before.contactName)
  await expect(fields.contactEmail).toHaveValue(before.contactEmail)
})

test("adds, edits and removes a pickup address", async ({ page }) => {
  const name = unique("E2E Dock")
  const addresses = section(page, "Pickup addresses")
  await addresses.getByRole("button", { name: "Add address" }).click()
  const dialog = page.getByRole("dialog", { name: "Add address" })

  // Required fields say so.
  await dialog.getByRole("button", { name: "Save address" }).click()
  await expect(dialog.getByText("This field is required").first()).toBeVisible()

  await dialog.getByRole("textbox", { name: "Address name" }).fill(name)
  await dialog.getByRole("textbox", { name: "Contact name" }).fill("Robin Packer")
  await dialog.getByRole("textbox", { name: "Phone number" }).fill("+1 206 555 0142")
  await dialog.getByRole("textbox", { name: "Street address" }).fill("42 Pier Road")
  await dialog.getByRole("textbox", { name: "City" }).fill("Tacoma")
  await dialog.getByRole("textbox", { name: "State or province" }).fill("WA")
  await dialog.getByRole("textbox", { name: "Postal code" }).fill("98402")
  await dialog.getByRole("combobox", { name: "Country" }).click()
  await page.getByRole("option", { name: "United States", exact: true }).click()
  await dialog.getByRole("button", { name: "Save address" }).click()
  await expect(dialog).toBeHidden()

  const item = addresses.getByRole("listitem").filter({ hasText: name })
  await expect(item).toContainText("42 Pier Road, Tacoma, WA 98402, US")
  await expect(item).toContainText("Robin Packer")

  await item.getByRole("button", { name: `More for ${name}` }).click()
  await page.getByRole("menuitem", { name: "Edit" }).click()
  const edit = page.getByRole("dialog", { name: "Edit address" })
  await edit.getByRole("textbox", { name: "City" }).fill("Seattle")
  await edit.getByRole("textbox", { name: "Postal code" }).fill("98101")
  await edit.getByRole("button", { name: "Save changes" }).click()
  await expect(edit).toBeHidden()
  await expect(item).toContainText("42 Pier Road, Seattle, WA 98101, US")

  await item.getByRole("button", { name: `More for ${name}` }).click()
  await page.getByRole("menuitem", { name: "Remove" }).click()
  await expect(addresses.getByText(name)).toBeHidden()
})
