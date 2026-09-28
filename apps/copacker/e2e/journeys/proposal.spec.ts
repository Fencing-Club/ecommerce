import type { Page } from "@playwright/test"
import { expect, test, unique } from "../fixtures"
import { daysFromNow, openOrder, titleStatus } from "./orders"

test.use({ role: "buyer" })

// Opens the supplier's edit of the order from the order's page.
async function editOrder(supplier: Page) {
  await supplier.getByRole("button", { name: "Edit order" }).click()
  await expect(supplier).toHaveURL(/\/revise$/)
  await expect(supplier.getByRole("heading", { level: 1, name: "Edit order" })).toBeVisible()
}

// E2E-REVISE: the supplier proposes changes, the buyer declines them, then approves the next ones; a ready date alone
// applies without approval, and a pending proposal can be withdrawn.
test("a supplier proposes changes to a purchase order and the buyer answers them", async ({ page, pageFor }) => {
  test.setTimeout(180_000)
  const url = await openOrder(page, "E2E-REVISE")
  const supplier = await pageFor("supplier")
  const panel = page.locator("[data-slot='card']").filter({ hasText: "Demo supplier proposed changes" })
  const reason = unique("Keep the right gloves")

  await test.step("the buyer submits it and the supplier finds it to pack", async () => {
    await page.getByRole("button", { name: "Submit to supplier" }).click()
    await expect(titleStatus(page)).toHaveText("With supplier")

    await supplier.goto("/orders")
    await expect(supplier.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible()
    await supplier.getByRole("tab", { name: /^To pack/ }).click()
    await expect(supplier.getByRole("row", { name: /E2E-REVISE/ })).toBeVisible()
    await supplier.getByRole("tab", { name: /^Waiting/ }).click()
    await expect(supplier.getByRole("row", { name: /E2E-REVISE/ })).toHaveCount(0)
    await supplier.getByRole("tab", { name: /^All/ }).click()
    await supplier.getByRole("link", { name: "E2E-REVISE", exact: true }).click()
    await expect(supplier.getByRole("heading", { level: 1, name: "E2E-REVISE" })).toBeVisible()
    await expect(supplier.getByText("Note from E2E Buyer")).toBeVisible()
  })

  await test.step("the supplier proposes new quantities, prices and terms", async () => {
    await editOrder(supplier)
    await supplier.getByRole("spinbutton", { name: "Quantity of Pro-grip glove, Left" }).fill("120")
    const price = supplier.getByRole("textbox", { name: "Unit price of Pro-grip glove, Left" })
    await price.fill("9.25")
    await price.press("Tab")
    await expect(supplier.getByText("Changed", { exact: true })).toBeVisible()

    // Removing a line marks it, and restoring it brings it back.
    await supplier.getByRole("button", { name: "Remove Pro-grip glove, Right" }).click()
    await expect(supplier.getByText("Removed", { exact: true })).toBeVisible()
    await expect(supplier.getByRole("spinbutton", { name: "Quantity of Pro-grip glove, Right" })).toHaveCount(0)
    await supplier.getByRole("button", { name: "Restore Pro-grip glove, Right" }).click()
    await expect(supplier.getByRole("spinbutton", { name: "Quantity of Pro-grip glove, Right" })).toHaveValue("50")

    await supplier.getByRole("combobox", { name: "Payment terms" }).click()
    await supplier.getByRole("option", { name: "Net 45" }).click()
    await supplier.getByLabel("Note to E2E Buyer").fill("Cotton prices went up this month")
    await supplier.getByRole("button", { name: "Send for approval" }).click()
    await expect(supplier.getByRole("heading", { level: 1, name: "E2E-REVISE" })).toBeVisible()
    await expect(supplier.getByText("Your proposed changes")).toBeVisible()
    await expect(supplier.getByText("Awaiting approval")).toBeVisible()
    // Packing waits for the buyer's answer.
    await expect(supplier.getByRole("button", { name: "Continue packing" })).toHaveCount(0)
    await expect(supplier.getByRole("button", { name: "Edit order" })).toHaveCount(0)
  })

  await test.step("the buyer declines with a reason", async () => {
    await page.reload()
    await expect(panel).toContainText("Approval needed")
    await expect(panel).toContainText("Cotton prices went up this month")
    await expect(panel.getByRole("row", { name: /Pro-grip glove/ })).toContainText(/100\s*to\s*120/)
    await expect(panel).toContainText(/Net 30\s*to\s*Net 45/)
    await expect(panel).toContainText(/\$1,275\.00\s*to\s*\$1,535\.00/)

    const dialog = page.getByRole("dialog", { name: "Decline the changes?" })
    await panel.getByRole("button", { name: "Decline" }).click()
    await expect(dialog).toContainText("Demo supplier sees your reason.")
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toBeHidden()
    await panel.getByRole("button", { name: "Decline" }).click()
    await dialog.getByLabel("Reason").fill(reason)
    await dialog.getByRole("button", { name: "Decline changes" }).click()
    await expect(panel).toBeHidden()
    await expect(page.getByRole("row", { name: /grip-left/ })).toContainText("100")
    await expect(page.getByRole("region", { name: "Timeline" })).toContainText(`Supplier's changes declined: ${reason}`)
  })

  await test.step("the supplier sees why and sends new changes", async () => {
    await supplier.reload()
    await expect(supplier.getByText("Declined", { exact: true })).toBeVisible()
    await expect(supplier.getByText(`Reason: ${reason}`)).toBeVisible()
    await editOrder(supplier)
    await supplier.getByRole("spinbutton", { name: "Quantity of Pro-grip glove, Right" }).fill("60")
    await supplier.getByRole("button", { name: "Send for approval" }).click()
    await expect(supplier.getByText("Your proposed changes")).toBeVisible()
  })

  // Approving builds the next revision from the buyer's Shopify variants, which the demo store can't answer, so the
  // buyer only reviews these changes and the supplier withdraws them.
  await test.step("the buyer sees the new changes waiting", async () => {
    await page.reload()
    await expect(panel.getByRole("row", { name: /Pro-grip glove/ })).toContainText(/50\s*to\s*60/)
    await expect(panel.getByRole("button", { name: "Approve changes" })).toBeEnabled()
    await expect(panel).toContainText("1 unchanged")
  })

  await test.step("the supplier reopens its pending changes, then withdraws them", async () => {
    await supplier.getByRole("button", { name: "Edit", exact: true }).click()
    await expect(supplier).toHaveURL(/\/revise$/)
    await expect(supplier.getByText("Awaiting approval")).toBeVisible()
    await expect(supplier.getByRole("spinbutton", { name: "Quantity of Pro-grip glove, Right" })).toHaveValue("60")
    await supplier.getByRole("button", { name: "Cancel" }).click()
    await expect(supplier.getByRole("heading", { level: 1, name: "E2E-REVISE" })).toBeVisible()
    await supplier.getByRole("button", { name: "Withdraw" }).click()
    await expect(supplier.getByText("Your proposed changes")).toBeHidden()
    await expect(supplier.getByRole("button", { name: "Edit order" })).toBeVisible()
    await page.goto(url)
    await expect(page.getByText("Demo supplier proposed changes")).toHaveCount(0)
    await expect(page.getByRole("row", { name: /grip-right/ })).toContainText("50")
    await expect(page.getByRole("region", { name: "Timeline" })).toContainText("Supplier withdrew its changes")
  })

  await test.step("a ready date alone applies without approval", async () => {
    await supplier.reload()
    await editOrder(supplier)
    await expect(supplier.getByText("Updates without approval")).toBeVisible()
    const ready = daysFromNow(21)
    await supplier.getByLabel("Ready date").fill(ready)
    await supplier.getByRole("button", { name: "Save", exact: true }).click()
    await expect(supplier.getByRole("heading", { level: 1, name: "E2E-REVISE" })).toBeVisible()
    await expect(supplier.getByText("Your proposed changes")).toHaveCount(0)
    await page.reload()
    await expect(page.getByText("Demo supplier proposed changes")).toHaveCount(0)
    await expect(page.getByRole("complementary").getByText("Ready", { exact: true })).toBeVisible()
    await expect(page.getByRole("region", { name: "Timeline" })).toContainText("Supplier set the ready date to")
  })
})
