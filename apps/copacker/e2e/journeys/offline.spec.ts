import { expect, test } from "../fixtures"
import { download, expectPdf } from "../support/files"
import { daysFromNow, openOrder, titleStatus } from "./orders"
import { addCartonProduct, fillCarton } from "./packing"

test.use({ role: "buyer" })

// Offline supplier isn't on Copacker, so the buyer sends E2E-OFFLINE itself and enters the supplier's side: its
// pickup address and cartons, then ships and receives the goods.
test("a buyer sends a purchase order to a supplier off Copacker and enters its shipment", async ({ page }) => {
  test.setTimeout(180_000)
  await openOrder(page, "E2E-OFFLINE")

  await test.step("send the purchase order", async () => {
    const alert = page.getByRole("alert").filter({ hasText: "Offline supplier isn’t on Copacker" })
    await expect(alert).toContainText("Email them the purchase order, then enter their carton details on the shipment.")
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
    await expect(page.getByText("Commercial invoice", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("textbox", { name: "Supplier SKU" })).toHaveCount(0)
    await expect(page.getByText("No cartons yet")).toBeVisible()
    await expect(page.getByRole("button", { name: "Finish packing" })).toBeDisabled()
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
    await page.getByLabel("Postal code").fill("97201")
    await page.getByRole("combobox", { name: "Country" }).click()
    await page.getByRole("option", { name: "United States", exact: true }).click()
    await page.getByRole("combobox", { name: "State or province" }).click()
    await page.getByRole("option", { name: "Oregon", exact: true }).click()
  })

  await test.step("enter cartons with quantities for each product", async () => {
    await page.getByRole("button", { name: "Add carton" }).click()
    await fillCarton(page, "1", { "Length (cm)": "40", "Width (cm)": "30", "Height (cm)": "25", "Weight (kg)": "9.5" })
    await addCartonProduct(page, "1", "Left", "grip-left", "100")
    await page.getByRole("button", { name: "Add carton" }).click()
    await fillCarton(page, "2", { "Length (cm)": "40", "Width (cm)": "30", "Height (cm)": "25", "Weight (kg)": "7" })
    await addCartonProduct(page, "2", "Right", "grip-right", "50")
    await expect(page.getByRole("region", { name: "Cartons" }).getByText("150 of 150 units")).toBeVisible()
    await expect(page.getByRole("button", { name: "Check packing" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Finish packing" })).toBeEnabled()
  })

  await test.step("submit the packing list", async () => {
    await page.getByRole("button", { name: "Finish packing" }).click()
    // Submitting makes the shipment's documents, which takes a while on a busy machine.
    await expect(titleStatus(page)).toHaveText("Ready for pickup", { timeout: 60_000 })
    await expect(page.getByRole("region", { name: "Carton 1", exact: true })).toContainText("grip-left")
    await expect(page.getByRole("region", { name: "Carton 2", exact: true })).toContainText("grip-right")
    await expect(page.getByText("200 Factory Road")).toBeVisible()
    await expect(page.getByRole("note").filter({ hasText: "Supplier packet ready" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Download supplier packet" })).toHaveAttribute(
      "href",
      /\/shipments\/[0-9a-f-]{36}\/packet$/
    )
  })

  await test.step("ship and receive the goods", async () => {
    await page.getByRole("button", { name: "Mark shipped" }).click()
    await expect(titleStatus(page)).toHaveText("Shipped")
    await page.getByRole("button", { name: "Mark received" }).click()
    await expect(titleStatus(page)).toHaveText("Received")
    await expect(page.getByRole("button", { name: "Mark received" })).toHaveCount(0)
  })

  await test.step("the purchase order keeps its SKU and shows the received shipment", async () => {
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "E2E-OFFLINE" }).click()
    await expect(page.getByRole("row", { name: /grip-right/ })).toContainText("GRIP-R")
    await expect(page.getByRole("link", { name: /^Shipment 1/ })).toContainText("Received")
    await expect(page.getByRole("region", { name: "Timeline" }).getByText(/Invoice changes approved/)).toHaveCount(0)
  })
})
