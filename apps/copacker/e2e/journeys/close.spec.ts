import { expect, test, unique } from "../fixtures"
import { download, expectPdf } from "../support/files"
import { openOrder, titleStatus } from "./orders"

test.use({ role: "buyer" })

// E2E-CLOSE goes to the supplier, collects its landed costs and a comment, then closes.
test("a buyer sends a purchase order, records landed costs and closes it", async ({ page }) => {
  test.setTimeout(120_000)
  const url = await openOrder(page, "E2E-CLOSE")
  const aside = page.getByRole("complementary")

  await test.step("submit to the supplier", async () => {
    await expect(titleStatus(page)).toHaveText("Draft")
    await page.getByRole("button", { name: "Submit to supplier" }).click()
    await expect(titleStatus(page)).toHaveText("With supplier")
    await expect(page.getByRole("button", { name: "Submit to supplier" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0)
    // Sending opens the first shipment for the supplier to pack.
    await expect(page.getByRole("link", { name: /^Shipment 1/ })).toContainText("Packing")
    const timeline = page.getByRole("region", { name: "Timeline" })
    await expect(timeline.getByText("Purchase order submitted to supplier")).toBeVisible()
  })

  await test.step("download the purchase order from Documents", async () => {
    const document = page.getByRole("link", { name: "Download Purchase order E2E-CLOSE.pdf" })
    await expect(document).toBeVisible()
    const po = await download(page, () => document.click())
    expect(po.name).toBe("E2E-CLOSE.pdf")
    await expectPdf(po.bytes)
  })

  await test.step("add landed costs", async () => {
    await expect(aside).toContainText("No costs yet")
    const add = aside.getByRole("button", { name: "Add cost" })
    const dialog = page.getByRole("dialog", { name: "Add landed cost" })

    await add.click()
    await expect(dialog).toContainText("Convert a bill in another currency to USD at the rate you paid.")
    await expect(dialog.getByRole("combobox", { name: "Type" })).toContainText("Freight")
    await dialog.getByRole("button", { name: "Add cost" }).click()
    await expect(dialog.getByText("Enter the amount")).toBeVisible()
    await dialog.getByLabel("Amount").fill("12x")
    await dialog.getByRole("button", { name: "Add cost" }).click()
    await expect(dialog.getByLabel("Amount")).toHaveAttribute("aria-invalid", "true")
    await dialog.getByLabel("Amount").fill("1,250.50")
    await dialog.getByLabel("Description").fill("Ocean freight to Seattle")
    await dialog.getByRole("button", { name: "Add cost" }).click()
    await expect(dialog).toBeHidden()

    await add.click()
    await dialog.getByRole("combobox", { name: "Type" }).click()
    await page.getByRole("option", { name: "Duty" }).click()
    await dialog.getByLabel("Amount").fill("80")
    await dialog.getByLabel("Description").fill("Customs entry")
    await dialog.getByRole("button", { name: "Add cost" }).click()
    await expect(dialog).toBeHidden()

    await add.click()
    await dialog.getByRole("combobox", { name: "Type" }).click()
    await page.getByRole("option", { name: "Other" }).click()
    await dialog.getByLabel("Amount").fill("19.5")
    await dialog.getByRole("button", { name: "Add cost" }).click()
    await expect(dialog).toBeHidden()

    await expect(aside.getByRole("listitem").filter({ hasText: "Freight" })).toContainText(
      "Ocean freight to Seattle$1,250.50"
    )
    await expect(aside.getByRole("listitem").filter({ hasText: "Duty" })).toContainText("Customs entry$80")
    await expect(aside.getByRole("listitem").filter({ hasText: "Other" })).toContainText("$19.50")
    await expect(aside).toContainText("Supplier total$1,275")
    await expect(aside).toContainText("Landed costs$1,350")
    await expect(aside).toContainText("Landed total$2,625")
  })

  await test.step("remove a landed cost", async () => {
    await aside.getByRole("button", { name: "More actions for Other cost" }).click()
    await page.getByRole("menuitem", { name: "Remove" }).click()
    await expect(aside.getByRole("listitem").filter({ hasText: "Other" })).toHaveCount(0)
    await expect(aside).toContainText("Landed costs$1,330.50")
    await expect(aside).toContainText("Landed total$2,605.50")
    await page.reload()
    await expect(aside).toContainText("Landed total$2,605.50")
  })

  await test.step("comment", async () => {
    const timeline = page.getByRole("region", { name: "Timeline" })
    const text = unique("Freight booked; closing once the invoice is paid")
    await timeline.getByRole("textbox", { name: "Comment" }).fill(text)
    // Ctrl+Enter posts, as the Post button does.
    await timeline.getByRole("textbox", { name: "Comment" }).press("Control+Enter")
    await expect(timeline.getByRole("listitem").filter({ hasText: text })).toContainText("Casey Tester")
  })

  await test.step("close the purchase order", async () => {
    const dialog = page.getByRole("alertdialog", { name: "Close E2E-CLOSE?" })
    await page.getByRole("button", { name: "More actions for E2E-CLOSE" }).click()
    await expect(page.getByRole("menuitem", { name: "Delete draft" })).toHaveCount(0)
    await page.getByRole("menuitem", { name: "Close purchase order" }).click()
    await expect(dialog).toContainText("Shipments the supplier hasn’t packed are canceled.")
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toBeHidden()
    await expect(titleStatus(page)).toHaveText("With supplier")

    await page.getByRole("button", { name: "More actions for E2E-CLOSE" }).click()
    await page.getByRole("menuitem", { name: "Close purchase order" }).click()
    await dialog.getByRole("button", { name: "Close purchase order" }).click()
    await expect(dialog).toBeHidden()
    await expect(titleStatus(page)).toHaveText("Closed")
    // The shipment nobody packed is cancelled with it, and nothing more can start.
    await expect(page.getByRole("link", { name: /^Shipment 1/ })).toContainText("Canceled")
    await expect(page.getByRole("button", { name: /Continue packing|Prepare next shipment/ })).toHaveCount(0)
    await expect(page.getByRole("region", { name: "Timeline" }).getByText("Purchase order closed")).toBeVisible()
  })

  await test.step("find it under Closed", async () => {
    await page.goto("/orders?status=closed")
    const row = page.getByRole("row", { name: /E2E-CLOSE / })
    await expect(row).toContainText("Closed")
    await page.goto("/orders?status=submitted")
    await expect(page.getByRole("row", { name: /E2E-CLOSE / })).toHaveCount(0)
    await page.goto(url)
    await expect(titleStatus(page)).toHaveText("Closed")
  })
})
