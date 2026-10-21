import type { Page } from "@playwright/test"
import { expect, test } from "../fixtures"
import { daysFromNow, openOrder, titleStatus } from "./orders"
import { addCartonProduct, fillCarton } from "./packing"

test.use({ role: "buyer" })

// The row a shipment list shows for E2E-FULFILL, under the given tab.
async function shipmentRow(page: Page, tab: string) {
  await page.goto("/shipments")
  await page
    .getByRole("navigation", { name: "Shipment views" })
    .getByRole("link", { name: new RegExp(`^${tab}`) })
    .click()
  return page.getByRole("row", { name: /^E2E-FULFILL, shipment / })
}

// E2E-FULFILL passes through E2E Forwarder: the buyer sends it, the supplier packs it (with a correction on the way),
// the supplier and then the forwarder ship it, and the buyer receives it. PO prices remain locked during packing.
test("a purchase order goes from the buyer through the supplier and forwarder and is received", async ({
  page,
  pageFor
}) => {
  test.setTimeout(300_000)
  const supplier = await pageFor("supplier")
  let shipmentUrl = ""

  await test.step("the buyer submits the purchase order", async () => {
    await openOrder(page, "E2E-FULFILL")
    await expect(
      page.getByRole("main").getByText("E2E Forwarder, E2E Forwarder address", { exact: true })
    ).toBeVisible()
    await page.getByRole("button", { name: "Submit to supplier" }).click()
    await expect(titleStatus(page)).toHaveText("With supplier")
  })

  await test.step("the supplier starts packing", async () => {
    await openOrder(supplier, "E2E-FULFILL")
    await expect(titleStatus(supplier)).toHaveText("Packing")
    await supplier.getByRole("button", { name: "Continue packing" }).click()
    await expect(supplier).toHaveURL(/\/shipments\/[0-9a-f-]{36}$/)
    shipmentUrl = supplier.url()
    await expect(supplier.getByRole("heading", { level: 1, name: "Shipment 1" })).toBeVisible()
    await expect(supplier.getByText("Commercial invoice", { exact: true })).toHaveCount(0)
    await expect(supplier.getByRole("textbox", { name: "Price per unit" })).toHaveCount(0)
    // The supplier's only pickup address is chosen for it.
    const shipFrom = supplier.getByRole("combobox", { name: "Ship from" })
    await expect(shipFrom).toContainText("E2E Supplier address")
    await expect(shipFrom).toContainText("100 Test Street")
  })

  await test.step("packing errors appear without a check button", async () => {
    await supplier.getByRole("button", { name: "Add carton" }).click()
    const length = supplier.getByRole("spinbutton", { name: "Carton A1: Length (cm)", exact: true })
    await length.focus()
    await length.press("Tab")
    await expect(length).toHaveAttribute("aria-invalid", "true")
    // Until every unit is packed, the packing form only saves a draft.
    await expect(supplier.getByRole("button", { name: "Finish packing" })).toHaveCount(0)
    await expect(supplier.getByRole("button", { name: "Check packing" })).toHaveCount(0)
    await supplier.getByLabel("Ready date").fill(daysFromNow(10))
    await fillCarton(supplier, "A1", {
      "Length (cm)": "50",
      "Width (cm)": "40",
      "Height (cm)": "30",
      "Weight (kg)": "12"
    })
    await addCartonProduct(supplier, "A1", "Left", "grip-left", "150")
    await expect(supplier.getByRole("button", { name: "Finish packing" })).toHaveCount(0)
    await supplier.getByRole("spinbutton", { name: "grip-left: quantity per carton A1", exact: true }).fill("100")
  })

  await test.step("the supplier packs two cartons and saves a draft", async () => {
    await supplier.getByRole("button", { name: "Add carton" }).click()
    await fillCarton(supplier, "B1", {
      "Length (cm)": "50",
      "Width (cm)": "40",
      "Height (cm)": "30",
      "Weight (kg)": "7"
    })
    await addCartonProduct(supplier, "B1", "Right", "grip-right", "50")
    await expect(supplier.getByRole("region", { name: "Cartons" }).getByText("150 of 150 units")).toBeVisible()
    // With every unit packed, the title row offers Finish packing and keeps Save draft in its menu.
    await supplier.getByRole("button", { name: "Actions", exact: true }).click()
    await supplier.getByRole("menuitem", { name: "Save draft" }).click()
    await expect(supplier.getByText("Draft saved")).toBeVisible()
    await supplier.reload()
    // Complete cartons reopen closed; opening one shows its products.
    await supplier.getByRole("button", { name: "Products in B1", exact: true }).click()
    await expect(
      supplier.getByRole("spinbutton", { name: "grip-right: quantity per carton B1", exact: true })
    ).toHaveValue("50")
    await expect(supplier.getByRole("textbox", { name: "Price per unit" })).toHaveCount(0)
    await supplier.getByRole("button", { name: "Finish packing" }).click()
    await expect(titleStatus(supplier)).toHaveText("Ready for pickup", { timeout: 60_000 })
  })

  await test.step("the supplier corrects packing without changing PO prices", async () => {
    await supplier.getByRole("button", { name: "Request a correction" }).click()
    await expect(supplier.getByRole("button", { name: "Request correction" })).toBeDisabled()
    await supplier.getByLabel("What needs to change?").fill("Carton B1 weighs 7.5 kg")
    await supplier.getByRole("button", { name: "Request correction" }).click()
    await expect(titleStatus(supplier)).toHaveText("Correction requested")
    await fillCarton(supplier, "B1", { "Weight (kg)": "7.5" })
    await supplier.getByRole("button", { name: "Finish packing" }).click()
    await expect(titleStatus(supplier)).toHaveText("Ready for pickup", { timeout: 60_000 })
    await expect(supplier.getByRole("region", { name: "Carton B1", exact: true })).toContainText("7.5")
    const row = await shipmentRow(page, "Active")
    await expect(row).toContainText("Ready for pickup")
    await expect(row).toContainText("Demo supplier")
  })

  await test.step("the supplier marks it shipped", async () => {
    await supplier.reload()
    await expect(titleStatus(supplier)).toHaveText("Ready for pickup")
    await supplier.getByRole("button", { name: "Mark shipped" }).click()
    await expect(titleStatus(supplier)).toHaveText("Shipped")
    await expect(supplier.getByRole("button", { name: "Mark shipped" })).toHaveCount(0)
    const row = await shipmentRow(supplier, "Active")
    await expect(row).toContainText("Shipped")
    await expect(row).toContainText("E2E Buyer")
  })

  await test.step("the forwarder ships it on, without seeing prices", async () => {
    const forwarder = await pageFor("forwarder")
    await openOrder(forwarder, "E2E-FULFILL")
    const main = forwarder.getByRole("main")
    await expect(main.getByRole("row", { name: /grip-left/ })).toContainText("100")
    await expect(main).not.toContainText("$")

    await main.getByRole("button", { name: "Mark shipped" }).click()
    const dialog = forwarder.getByRole("dialog", { name: "Mark shipped" })
    await dialog.getByRole("button", { name: "Mark shipped" }).click()
    await expect(dialog.getByText("Enter the freight cost")).toBeVisible()
    await expect(dialog.getByText("Enter the carrier")).toBeVisible()
    await expect(dialog.getByText("Enter the tracking or booking number")).toBeVisible()
    await dialog.getByLabel("Freight cost").fill("350")
    await dialog.getByLabel("Carrier").fill("Maersk")
    await dialog.getByLabel("Tracking or booking number").fill("MAEU1234567")
    await dialog.getByRole("button", { name: "Mark shipped" }).click()
    await expect(dialog).toBeHidden()
    await expect(main.getByText("Shipped onward")).toBeVisible()
    await expect(main).toContainText("Maersk MAEU1234567")
  })

  await test.step("the buyer receives it", async () => {
    await page.goto(shipmentUrl)
    await expect(titleStatus(page)).toHaveText("Shipped onward")
    await page.getByRole("button", { name: "Mark received" }).click()
    await expect(titleStatus(page)).toHaveText("Received")

    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "E2E-FULFILL" }).click()
    await expect(page.getByRole("link", { name: /^Shipment 1/ })).toContainText("Received")
    await expect(page.getByRole("row", { name: /grip-left/ })).toContainText("$8.50")
    // The forwarder's freight counts toward the landed costs.
    await expect(page.getByRole("complementary")).toContainText("$350")
    await expect(page.getByRole("region", { name: "Timeline" })).toContainText("E2E Forwarder shipped the goods")
  })

  await test.step("both shipment lists move it to Received", async () => {
    for (const viewer of [page, supplier]) {
      await expect(await shipmentRow(viewer, "Received")).toContainText("Received")
      await expect(await shipmentRow(viewer, "Active")).toHaveCount(0)
      await expect(await shipmentRow(viewer, "All")).toContainText("Received")
    }
  })
})
