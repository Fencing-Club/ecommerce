import type { Page } from "@playwright/test"
import { deployed, expect, test } from "../fixtures"
import { pdfFile, type UploadFile } from "../support/files"

test.use({ role: "buyer" })

async function choose(page: Page, file: UploadFile) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Drop a PDF or browse/ }).click()
  ])
  await chooser.setFiles(file)
}

test.beforeEach(async ({ page }) => {
  await page.goto("/orders/import")
  await expect(page.getByRole("heading", { name: "Import purchase order", level: 1 })).toBeVisible()
})

test("starts with no imports and Import disabled", async ({ page }) => {
  await expect(page.getByText("Up to 10 MB and 50 pages")).toBeVisible()
  await expect(page.getByRole("button", { name: "Import" })).toBeDisabled()
  await expect(page.getByRole("table")).toHaveCount(0)
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Purchase orders" })
  ).toHaveAttribute("href", "/orders")
})

test("turns down a file that isn't a PDF or is too large", async ({ page }) => {
  await choose(page, { name: "order.txt", mimeType: "text/plain", buffer: Buffer.from("Purchase order 42") })
  await expect(page.getByText("Choose a PDF", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Import" })).toBeDisabled()

  const pdf = await pdfFile("huge-order.pdf")
  await choose(page, { ...pdf, buffer: Buffer.concat([pdf.buffer, Buffer.alloc(11 * 1024 * 1024)]) })
  await expect(page.getByText("Choose a PDF up to 10 MB")).toBeVisible()
  await expect(page.getByRole("button", { name: "Import" })).toBeDisabled()
})

test("takes a PDF and shows what the server says about it", async ({ page }) => {
  await choose(page, await pdfFile("supplier-order.pdf", ["PO 42: 100 x grip-left at $8.50"]))
  await expect(page.getByText("supplier-order.pdf")).toBeVisible()
  const importButton = page.getByRole("button", { name: "Import" })
  await expect(importButton).toBeEnabled()

  // Removing the file empties the zone again.
  await page.getByRole("button", { name: "Remove supplier-order.pdf" }).click()
  await expect(importButton).toBeDisabled()

  test.skip(deployed, "Importing runs the PDF through a paid language model on staging")
  await choose(page, await pdfFile("supplier-order.pdf", ["PO 42: 100 x grip-left at $8.50"]))
  // Locally there's no language model to read it, so the import is refused with the server's message.
  await importButton.click()
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toBeVisible()
  await expect(page.getByRole("table")).toHaveCount(0)
})
