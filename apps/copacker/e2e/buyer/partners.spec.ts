import type { Page } from "@playwright/test"
import { deployed, expect, test, unique } from "../fixtures"

test.use({ role: "buyer" })

const rowFor = (page: Page, name: string) => page.getByRole("row").filter({ has: page.getByRole("button", { name }) })

async function openMenu(page: Page, name: string, item: string) {
  await page.getByRole("button", { name: `More actions for ${name}` }).click()
  await page.getByRole("menuitem", { name: item, exact: true }).click()
}

async function addSupplier(page: Page, name: string) {
  await page.getByRole("button", { name: "Add partner" }).click()
  await page.getByRole("menuitem", { name: "Supplier" }).click()
  const dialog = page.getByRole("dialog", { name: "Add a supplier" })
  await dialog.getByRole("button", { name: "Add supplier" }).click()
  await expect(dialog.getByRole("textbox", { name: "Supplier company" })).toHaveAttribute("aria-invalid", "true")
  await dialog.getByRole("textbox", { name: "Supplier company" }).fill(name)
  await dialog.getByRole("button", { name: "Add supplier" }).click()
  await expect(dialog).toBeHidden()
  await expect(rowFor(page, name)).toContainText("Not invited")
}

test.beforeEach(async ({ page }) => {
  await page.goto("/partners")
  await expect(page.getByRole("heading", { name: "Partners", level: 1 })).toBeVisible()
})

test("lists the seeded partners by type and finds them by name", { tag: "@mobile" }, async ({ page }) => {
  await expect(rowFor(page, "Demo supplier")).toContainText("On Copacker")
  await expect(rowFor(page, "E2E Forwarder")).toContainText("Freight forwarder")
  await expect(rowFor(page, "Offline supplier")).toContainText("Not invited")

  const tabs = page.getByRole("navigation", { name: "Partner types" })
  await tabs.getByRole("link", { name: "Suppliers" }).click()
  await expect(page).toHaveURL(/type=supplier/)
  await expect(rowFor(page, "Demo supplier")).toBeVisible()
  await expect(rowFor(page, "E2E Forwarder")).toBeHidden()

  await tabs.getByRole("link", { name: "Forwarders" }).click()
  await expect(page).toHaveURL(/type=forwarder/)
  await expect(rowFor(page, "E2E Forwarder")).toBeVisible()
  await expect(rowFor(page, "Demo supplier")).toBeHidden()

  await tabs.getByRole("link", { name: "All" }).click()
  await expect(page).not.toHaveURL(/type=/)
  await page.getByRole("searchbox", { name: "Search partners" }).fill("offline")
  await page.getByRole("searchbox", { name: "Search partners" }).press("Enter")
  await expect(page).toHaveURL(/q=offline/)
  await expect(rowFor(page, "Offline supplier")).toBeVisible()
  await expect(rowFor(page, "Demo supplier")).toBeHidden()

  await page.getByRole("searchbox", { name: "Search partners" }).fill("no partner is called this")
  await page.getByRole("searchbox", { name: "Search partners" }).press("Enter")
  await expect(page.getByText("No partners match “no partner is called this”")).toBeVisible()
})

test("adds a supplier, edits its details and adds a pickup address", async ({ page }) => {
  const name = unique("E2E Supplier Co")
  await addSupplier(page, name)

  await openMenu(page, name, "Edit")
  const edit = page.getByRole("dialog", { name: `Edit ${name}` })
  await edit.getByRole("textbox", { name: "Contact name" }).fill("Lee Maker")
  await edit.getByRole("textbox", { name: "Phone" }).fill("+86 755 5555 0100")
  await edit.getByRole("textbox", { name: "Website" }).fill("maker.example.net")
  await edit.getByRole("spinbutton", { name: "Lead time (days)" }).fill("45")
  await edit.getByRole("button", { name: "Save" }).click()
  await expect(edit).toBeHidden()
  const row = rowFor(page, name)
  await expect(row).toContainText("Lee Maker")
  await expect(row).toContainText("Lead time 45 days")

  await openMenu(page, name, "Edit")
  await expect(edit.getByRole("textbox", { name: "Website" })).toHaveValue("https://maker.example.net")
  await edit.getByRole("button", { name: "Cancel" }).click()

  await openMenu(page, name, "Addresses")
  const sheet = page.getByRole("dialog", { name })
  await expect(sheet.getByText("No addresses yet")).toBeVisible()
  await sheet.getByRole("button", { name: "Add address" }).click()
  const form = page.getByRole("dialog", { name: `Add a pickup address for ${name}` })
  const address = unique("Factory")
  await form.getByRole("textbox", { name: "Address name" }).fill(address)
  await form.getByRole("textbox", { name: "Contact name" }).fill("Lee Maker")
  await form.getByRole("textbox", { name: "Phone number" }).fill("+86 755 5555 0100")
  await form.getByRole("textbox", { name: "Email" }).fill("dock@example.net")
  await form.getByRole("textbox", { name: "Street address" }).fill("8 Industrial Road")
  await form.getByRole("textbox", { name: "Address line 2" }).fill("Building 3")
  await form.getByRole("textbox", { name: "City" }).fill("Shenzhen")
  await form.getByRole("textbox", { name: "State or province" }).fill("Guangdong")
  await form.getByRole("textbox", { name: "Postal code" }).fill("518000")
  await form.getByRole("combobox", { name: "Country" }).click()
  await page.getByRole("option", { name: "China", exact: true }).click()
  await form.getByRole("button", { name: "Save address" }).click()
  await expect(form).toBeHidden()
  await expect(sheet.getByText(address)).toBeVisible()
  await expect(sheet.getByText(/8 Industrial Road/)).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(row).toContainText("1 address")
})

test("checks the invite form and invites a new supplier", async ({ page }) => {
  const name = unique("E2E Invitee")
  await addSupplier(page, name)
  await openMenu(page, name, "Invite")
  const dialog = page.getByRole("dialog", { name: `Invite ${name}` })
  const email = dialog.getByRole("textbox", { name: "Supplier email" })
  await dialog.getByRole("button", { name: "Send invitation" }).click()
  await expect(email).toHaveAttribute("aria-invalid", "true")
  await email.fill("not an email")
  await dialog.getByRole("button", { name: "Send invitation" }).click()
  await expect(dialog.getByText("Enter an email address")).toBeVisible()

  if (deployed) {
    // Staging sends the email for real.
    await dialog.getByRole("button", { name: "Cancel" }).click()
    return
  }
  // Locally the invitation email is only queued.
  await email.fill(`${name.replaceAll(" ", "-").toLowerCase()}@example.net`)
  await dialog.getByRole("button", { name: "Send invitation" }).click()
  await expect(dialog).toBeHidden()
  await expect(rowFor(page, name)).toContainText("Invited")
  await page.getByRole("button", { name: `More actions for ${name}` }).click()
  await expect(page.getByRole("menuitem", { name: "Resend invitation" })).toBeVisible()
  await page.keyboard.press("Escape")
})

test("adds a freight forwarder, renames it, gives it an address and removes it", async ({ page }) => {
  const name = unique("E2E Freight")
  await page.getByRole("button", { name: "Add partner" }).click()
  await page.getByRole("menuitem", { name: "Freight forwarder" }).click()
  const add = page.getByRole("dialog", { name: "Add a forwarder" })
  await add.getByRole("textbox", { name: "Company" }).fill(name)
  await add.getByRole("button", { name: "Add forwarder" }).click()
  await expect(add).toBeHidden()
  await expect(rowFor(page, name)).toContainText("Freight forwarder")

  // A forwarder's name, addresses and removal are in its Addresses sheet.
  await openMenu(page, name, "Addresses")
  const sheet = page.getByRole("dialog", { name })
  await expect(sheet.getByText("No addresses yet")).toBeVisible()
  await sheet.getByRole("button", { name: "Add address" }).click()
  const form = page.getByRole("dialog", { name: `Add an address for ${name}` })
  await form.getByRole("textbox", { name: "Address name" }).fill("Yiwu warehouse")
  await form.getByRole("textbox", { name: "Contact name" }).fill("Pat Forwarder")
  await form.getByRole("textbox", { name: "Street address" }).fill("1 Port Road")
  await form.getByRole("textbox", { name: "City" }).fill("Yiwu")
  await form.getByRole("textbox", { name: "State or province" }).fill("Zhejiang")
  await form.getByRole("textbox", { name: "Postal code" }).fill("322000")
  await form.getByRole("combobox", { name: "Country" }).click()
  await page.getByRole("option", { name: "China", exact: true }).click()
  await form.getByRole("button", { name: "Save address" }).click()
  await expect(form).toBeHidden()
  await expect(sheet.getByText("Yiwu warehouse")).toBeVisible()

  const renamed = `${name} Logistics`
  await sheet.getByRole("button", { name: `Edit ${name}` }).click()
  const rename = page.getByRole("dialog", { name: "Edit forwarder" })
  await rename.getByRole("textbox", { name: "Company" }).fill(renamed)
  await rename.getByRole("button", { name: "Save" }).click()
  await expect(rename).toBeHidden()
  const renamedSheet = page.getByRole("dialog", { name: renamed })
  await expect(renamedSheet.getByText("Yiwu warehouse")).toBeVisible()
  await renamedSheet.getByRole("button", { name: "Remove", exact: true }).click()
  const confirm = page.getByRole("alertdialog", { name: `Remove ${renamed}?` })
  await confirm.getByRole("button", { name: "Remove" }).click()
  await expect(confirm).toBeHidden()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: renamed })).toHaveCount(0)
  await expect(page.getByRole("button", { name })).toHaveCount(0)
})
