import { expect, test } from "../fixtures"
import { download, expectPdf, pdfFile } from "../support/files"
import { daysFromNow, openOrder, titleStatus } from "./orders"

test.use({ role: "buyer" })

// Offline supplier isn't on Copacker, so the buyer sends E2E-OFFLINE itself and enters the supplier's side: its
// invoice, pickup address and cartons, then ships and receives the goods.
test("a buyer sends a purchase order to a supplier off Copacker and enters its shipment", async ({ page }) => {
  test.setTimeout(180_000)
  await openOrder(page, "E2E-OFFLINE")

  await test.step("send the purchase order", async () => {
    const alert = page.getByRole("alert").filter({ hasText: "Offline supplier isn’t on Copacker" })
    await expect(alert).toContainText("Email them the purchase order yourself")
    await expect(page.getByRole("button", { name: "Submit to supplier" })).toHaveCount(0)
    await page.getByRole("button", { name: "Send purchase order" }).click()
    await expect(titleStatus(page)).toHaveText("With supplier")
    await expect(
      page
        .getByRole("region", { name: "Timeline" })
        .getByText("Purchase order sent; share its documents with the supplier")
    ).toBeVisible()
    const po = await download(page, () =>
      page.getByRole("link", { name: "Download Purchase order E2E-OFFLINE.pdf" }).click()
    )
    expect(po.name).toBe("E2E-OFFLINE.pdf")
    await expectPdf(po.bytes)
  })

  await test.step("open the shipment to enter the supplier's packing", async () => {
    await page.getByRole("button", { name: "Continue packing" }).click()
    await expect(page).toHaveURL(/\/shipments\/[0-9a-f-]{36}$/)
    await expect(page.getByRole("heading", { level: 1, name: "Shipment 1" })).toBeVisible()
    await expect(titleStatus(page)).toHaveText("Packing")
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("E2E-OFFLINE")
    await expect(page.getByText("Offline supplier’s invoice for these cartons")).toBeVisible()
    await expect(page.getByText("Changes update the purchase order")).toBeVisible()
    await expect(page.getByText("No cartons yet")).toBeVisible()
    await expect(page.getByRole("button", { name: "Submit packing list" })).toBeDisabled()
  })

  await test.step("enter the pickup address the supplier emailed", async () => {
    // The supplier has no saved pickup address yet, so the address is typed in.
    await expect(page.getByRole("combobox", { name: "Pickup address" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Add address" })).toBeVisible()
    await page.getByLabel("Ready for pickup").fill(daysFromNow(14))
    await page.getByLabel("Contact name").fill("Sam Offline")
    await page.getByLabel("Phone number").fill("+1 503 555 0199")
    await page.getByLabel("Street address").fill("200 Factory Road")
    await page.getByLabel("City").fill("Portland")
    await page.getByLabel("State or province").fill("OR")
    await page.getByLabel("Postal code").fill("97201")
    await page.getByRole("combobox", { name: "Country" }).click()
    await page.getByRole("option", { name: "United States", exact: true }).click()
  })

  await test.step("enter the cartons and the supplier's invoice", async () => {
    await page.getByRole("button", { name: "Add carton" }).click()
    await page.getByLabel("Carton number").fill("OFF-1")
    for (const [field, value] of [
      ["Length (cm)", "40"],
      ["Width (cm)", "30"],
      ["Height (cm)", "25"],
      ["Weight (kg)", "9.5"]
    ]) {
      await page.getByRole("spinbutton", { name: field }).fill(value)
    }
    await page.getByRole("spinbutton", { name: "Units", exact: true }).fill("100")
    await page.getByRole("button", { name: "Duplicate carton OFF-1" }).click()
    await page.getByLabel("Carton number").nth(1).fill("OFF-2")
    await page.getByRole("combobox", { name: "Product" }).nth(1).click()
    await page.getByRole("option", { name: "Pro-grip glove / Right / grip-right" }).click()
    await page.getByRole("spinbutton", { name: "Units", exact: true }).nth(1).fill("50")
    await expect(page.getByText("2 cartons, 150 units")).toBeVisible()

    // The supplier's invoice names a new SKU for the right glove, which the buyer's own entry applies at once.
    await page.getByRole("textbox", { name: "Supplier SKU" }).nth(1).fill("GRIP-R2")

    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: /Drop a PDF or browse/ }).click()
    await (await chooser).setFiles(await pdfFile("Offline invoice.pdf", ["Offline supplier invoice 1001"]))
    await expect(page.getByRole("link", { name: "Offline invoice.pdf" })).toBeVisible()

    await page.getByRole("button", { name: "Check packing" }).click()
    await expect(page.getByText("Ready to submit; changes update the purchase order")).toBeVisible()
  })

  await test.step("submit the packing list", async () => {
    await page.getByRole("button", { name: "Submit packing list" }).click()
    // Submitting makes the shipment's documents, which takes a while on a busy machine.
    await expect(titleStatus(page)).toHaveText("Ready for pickup", { timeout: 60_000 })
    const cartons = page.getByRole("table")
    await expect(cartons.getByRole("row", { name: /^OFF-1 / })).toContainText("grip-left")
    await expect(cartons.getByRole("row", { name: /^OFF-2 / })).toContainText("40 × 30 × 25")
    await expect(page.getByText("200 Factory Road")).toBeVisible()
    await expect(page.getByRole("link", { name: "Download Commercial invoice Offline invoice.pdf" })).toBeVisible()

    // The packet's product labels look up each product's country of origin in Shopify, which the demo store can't
    // answer, so the packet is offered but not downloaded here.
    await expect(page.getByRole("note").filter({ hasText: "Supplier packet ready" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Download supplier packet" })).toHaveAttribute(
      "href",
      /\/api\/shipments\/[0-9a-f-]{36}\/packet$/
    )
  })

  await test.step("ship and receive the goods", async () => {
    await page.getByRole("button", { name: "Mark shipped" }).click()
    await expect(titleStatus(page)).toHaveText("Shipped")
    await page.getByRole("button", { name: "Mark received" }).click()
    await expect(titleStatus(page)).toHaveText("Received")
    await expect(page.getByRole("button", { name: "Mark received" })).toHaveCount(0)
  })

  await test.step("the purchase order shows the new SKU and the received shipment", async () => {
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "E2E-OFFLINE" }).click()
    await expect(page.getByRole("row", { name: /grip-right/ })).toContainText("GRIP-R2")
    await expect(page.getByRole("link", { name: /^Shipment 1/ })).toContainText("Received")
    await expect(
      page.getByRole("region", { name: "Timeline" }).getByText(/Invoice changes approved; purchase order revision 2/)
    ).toBeVisible()
  })
})
