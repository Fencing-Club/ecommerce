import type { Page } from "@playwright/test"
import { expect, test } from "../fixtures"
import { download, expectPdf, pdfFile } from "../support/files"
import { daysFromNow, openOrder, titleStatus } from "./orders"

test.use({ role: "buyer" })

async function uploadInvoice(page: Page, name: string) {
  const chooser = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: /Drop a PDF or browse/ }).click()
  await (await chooser).setFiles(await pdfFile(name, [`Demo supplier invoice ${name}`]))
  await expect(page.getByRole("link", { name })).toBeVisible()
}

async function fillCarton(page: Page, index: number, carton: Record<string, string>) {
  for (const [label, value] of Object.entries(carton)) {
    const field =
      label === "Carton number"
        ? page.getByRole("textbox", { name: label })
        : page.getByRole("spinbutton", { name: label, exact: true })
    await field.nth(index).fill(value)
  }
}

// The row a shipment list shows for E2E-FULFILL, under the given tab.
async function shipmentRow(page: Page, tab: string) {
  await page.goto("/shipments")
  await page
    .getByRole("navigation", { name: "Shipment status" })
    .getByRole("link", { name: new RegExp(`^${tab}`) })
    .click()
  return page.getByRole("row", { name: /^E2E-FULFILL / })
}

// E2E-FULFILL passes through E2E Forwarder: the buyer sends it, the supplier packs it (with a correction on the way),
// the buyer approves the invoice's new price, the supplier and then the forwarder ship it, and the buyer receives it.
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
    await expect(supplier.getByText("Your invoice for these cartons")).toBeVisible()
    await expect(supplier.getByText("Changes go to the buyer for approval")).toBeVisible()
    // The supplier's only pickup address is chosen for it.
    await expect(supplier.getByRole("combobox", { name: "Pickup address" })).toContainText("E2E Supplier address")
    await expect(supplier.getByText("100 Test Street")).toBeVisible()
  })

  await test.step("a carton that doesn't fit the order is caught", async () => {
    await supplier.getByRole("button", { name: "Add carton" }).click()
    await supplier.getByRole("button", { name: "Check packing" }).click()
    await expect(supplier.getByText("Fix the highlighted fields")).toBeVisible()
    await expect(supplier.getByRole("textbox", { name: "Carton number" })).toHaveAttribute("aria-invalid", "true")
    await expect(supplier.getByLabel("Ready for pickup")).toHaveAttribute("aria-invalid", "true")

    await supplier.getByLabel("Ready for pickup").fill(daysFromNow(10))
    await fillCarton(supplier, 0, {
      "Carton number": "FUL-1",
      "Length (cm)": "50",
      "Width (cm)": "40",
      "Height (cm)": "30",
      "Weight (kg)": "12",
      Units: "150"
    })
    await expect(supplier.getByRole("row", { name: /grip-left/ })).toContainText("150 of 100")
    // The commercial invoice is still missing, so checking stops before the server does.
    await supplier.getByRole("button", { name: "Check packing" }).click()
    await expect(supplier.getByRole("alert").filter({ hasText: "Upload the commercial invoice" })).toBeVisible()
    await expect(supplier.getByRole("alert").filter({ hasText: "Fix the highlighted fields" })).toBeVisible()
    await expect(supplier.getByText(/^Ready to submit/)).toHaveCount(0)
  })

  await test.step("the supplier packs two cartons, changes a price and saves a draft", async () => {
    await fillCarton(supplier, 0, { Units: "100" })
    await supplier.getByRole("button", { name: "Duplicate carton FUL-1" }).click()
    await fillCarton(supplier, 1, { "Carton number": "FUL-2", "Weight (kg)": "7", Units: "50" })
    await supplier.getByRole("combobox", { name: "Product" }).nth(1).click()
    await supplier.getByRole("option", { name: "Pro-grip glove / Right / grip-right" }).click()
    await expect(supplier.getByText("2 cartons, 150 units")).toBeVisible()
    const price = supplier.getByRole("textbox", { name: "Price per unit" }).first()
    await price.fill("9.00")
    await price.press("Tab")

    await supplier.getByRole("button", { name: "Save draft" }).click()
    await expect(supplier.getByText("Draft saved")).toBeVisible()
    await supplier.reload()
    await expect(supplier.getByRole("textbox", { name: "Carton number" })).toHaveCount(2)
    await expect(supplier.getByRole("textbox", { name: "Carton number" }).last()).toHaveValue("FUL-2")
    await expect(supplier.getByRole("textbox", { name: "Price per unit" }).first()).toHaveValue("9.00")
    await expect(supplier.getByText("2 cartons, 150 units")).toBeVisible()
  })

  await test.step("the supplier uploads its invoice and submits the packing list", async () => {
    await uploadInvoice(supplier, "FUL invoice.pdf")
    await supplier.getByRole("button", { name: "Check packing" }).click()
    await expect(supplier.getByText("Ready to submit; changes go to the buyer for approval")).toBeVisible()
    await supplier.getByRole("button", { name: "Submit packing list" }).click()
    await expect(titleStatus(supplier)).toHaveText("Approval needed")
    await expect(supplier.getByText("Waiting for the buyer’s approval")).toBeVisible()
    await expect(supplier.getByRole("row", { name: /^FUL-2 / })).toContainText("50 × 40 × 30")
  })

  await test.step("the supplier requests a correction and resubmits", async () => {
    await supplier.getByRole("button", { name: "Request a correction" }).click()
    // Nothing to send until the reason is written.
    await expect(supplier.getByRole("button", { name: "Request correction" })).toBeDisabled()
    await supplier.getByLabel("What needs to change?").fill("Carton FUL-2 weighs 7.5 kg")
    await supplier.getByRole("button", { name: "Request correction" }).click()
    await expect(titleStatus(supplier)).toHaveText("Correction requested")
    await expect(supplier.getByText("Carton FUL-2 weighs 7.5 kg")).toBeVisible()

    // A correction outdates the shipment's documents, so the invoice goes up again.
    await fillCarton(supplier, 1, { "Weight (kg)": "7.5" })
    await uploadInvoice(supplier, "FUL invoice corrected.pdf")
    await supplier.getByRole("button", { name: "Submit packing list" }).click()
    await expect(titleStatus(supplier)).toHaveText("Approval needed")
    await expect(supplier.getByRole("row", { name: /^FUL-2 / })).toContainText("7.5")
  })

  await test.step("the buyer's shipment list shows the approval it needs", async () => {
    const row = await shipmentRow(page, "Active")
    await expect(row).toContainText("Approval needed")
    await expect(row).toContainText("Demo supplier")
    await expect(row).toContainText("2")
  })

  await test.step("the buyer approves the invoice's new price", async () => {
    await page.goto(shipmentUrl)
    await expect(titleStatus(page)).toHaveText("Approval needed")
    await expect(page.getByText("Invoice changes")).toBeVisible()
    await expect(page.getByText(/Price per unit \$8\.50/)).toContainText("$9.00")
    await expect(page.getByRole("checkbox", { name: "Also update Shopify unit costs" })).not.toBeChecked()
    await page.getByRole("button", { name: "Approve changes" }).click()
    // Approving makes the shipment's documents, which takes a while on a busy machine.
    await expect(titleStatus(page)).toHaveText("Ready for pickup", { timeout: 60_000 })
    await expect(page.getByRole("note").filter({ hasText: "Supplier packet ready" })).toBeVisible()

    const invoice = await download(page, () =>
      page.getByRole("link", { name: "Download Commercial invoice FUL invoice corrected.pdf" }).click()
    )
    expect(invoice.name).toBe("FUL invoice corrected.pdf")
    await expectPdf(invoice.bytes)
  })

  await test.step("the supplier marks it shipped", async () => {
    await supplier.reload()
    await expect(titleStatus(supplier)).toHaveText("Ready for pickup")
    const invoice = await download(supplier, () =>
      supplier.getByRole("link", { name: "Download Commercial invoice FUL invoice corrected.pdf" }).click()
    )
    await expectPdf(invoice.bytes)
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
    const invoice = await download(forwarder, () =>
      forwarder.getByRole("link", { name: "Download Commercial invoice FUL invoice corrected.pdf" }).click()
    )
    await expectPdf(invoice.bytes)

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
    await expect(page.getByRole("row", { name: /grip-left/ })).toContainText("$9.00")
    // The forwarder's freight counts toward the landed costs.
    await expect(page.getByRole("complementary")).toContainText("$350.00")
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
