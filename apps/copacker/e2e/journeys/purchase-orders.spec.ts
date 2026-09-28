import { expect, test, unique } from "../fixtures"
import { download, expectPdf } from "../support/files"
import { openOrder, titleStatus } from "./orders"

test.use({ role: "buyer" })

test("the purchase order list filters by status", { tag: "@mobile" }, async ({ page }) => {
  await page.goto("/orders")
  await expect(page.getByRole("heading", { level: 1, name: "Purchase orders" })).toBeVisible()
  for (const stat of ["Open orders", "With suppliers", "Drafts"]) {
    await expect(page.getByText(stat, { exact: true })).toBeVisible()
  }
  const tabs = page.getByRole("navigation", { name: "Purchase order status" })
  const draft = page.getByRole("row", { name: /^E2E-DRAFT / })
  const sent = page.getByRole("row", { name: /^DEMO-1 / })

  await expect(tabs.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page")
  await expect(draft).toContainText("Demo supplier")
  await expect(draft).toContainText("Draft")
  await expect(draft).toContainText("$1,275.00")
  await expect(sent).toContainText("With supplier")
  await expect(sent).toContainText("$600.00")

  await tabs.getByRole("link", { name: "Draft" }).click()
  await expect(page).toHaveURL(/\?status=draft$/)
  await expect(tabs.getByRole("link", { name: "Draft" })).toHaveAttribute("aria-current", "page")
  await expect(draft).toBeVisible()
  await expect(sent).toHaveCount(0)

  await tabs.getByRole("link", { name: "With supplier" }).click()
  await expect(page).toHaveURL(/\?status=submitted$/)
  await expect(sent).toBeVisible()
  await expect(draft).toHaveCount(0)

  await tabs.getByRole("link", { name: "Closed" }).click()
  await expect(page).toHaveURL(/\?status=closed$/)
  await expect(sent).toHaveCount(0)
  await expect(draft).toHaveCount(0)

  // A click anywhere on a row opens its purchase order.
  await tabs.getByRole("link", { name: "All" }).click()
  await sent.getByRole("cell", { name: "$600.00" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "DEMO-1" })).toBeVisible()
})

test("a purchase order sent to Amazon shows its lines, costs and terms", async ({ page }) => {
  await openOrder(page, "DEMO-1")
  await expect(titleStatus(page)).toHaveText("With supplier")
  await expect(page.getByRole("button", { name: "Submit to supplier" })).toHaveCount(0)

  const line = page.getByRole("row", { name: /Pro-grip glove 3-pack/ })
  await expect(line).toContainText("grip-left-3pk")
  await expect(line).toContainText("3 per pack")
  await expect(line).toContainText("Not set")
  await expect(line).toContainText("$4.00")
  await expect(line).toContainText("$600.00")
  await expect(page.getByText("Label every unit with its FNSKU barcode, covering any other barcode.")).toBeVisible()

  const aside = page.getByRole("complementary")
  await expect(aside).toContainText("Cost summary")
  await expect(aside).toContainText("1 variant (150 units)")
  await expect(aside).toContainText("Purchase order details")
  await expect(aside.getByRole("definition").first()).toHaveText("Dec 1, 2026")
  await expect(aside).toContainText("30% deposit, 70% before shipment")
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible()

  // A sent purchase order closes rather than deletes.
  await page.getByRole("button", { name: "More actions for DEMO-1" }).click()
  const menu = page.getByRole("menu", { name: "More actions for DEMO-1" })
  await expect(menu.getByRole("menuitem", { name: "Download purchase order" })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Close purchase order" })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Delete draft" })).toHaveCount(0)
  await expect(menu.getByRole("menuitem", { name: "Edit" })).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(menu).toBeHidden()
})

test("a draft shows its lines and totals, downloads, and takes comments", async ({ page }) => {
  await openOrder(page, "E2E-DRAFT")
  await expect(titleStatus(page)).toHaveText("Draft")
  await expect(page.getByRole("button", { name: "Submit to supplier" })).toBeVisible()
  const main = page.getByRole("main")
  await expect(main.getByText("Demo supplier", { exact: true })).toBeVisible()
  await expect(main.getByText("E2E Buyer address", { exact: true })).toBeVisible()

  const left = page.getByRole("row", { name: /grip-left/ })
  const right = page.getByRole("row", { name: /grip-right/ })
  await expect(left.getByRole("cell")).toHaveText([
    /Pro-grip glove\s*Left\s*grip-left/,
    "GRIP-L",
    "100",
    "$8.50",
    "$850.00",
    ""
  ])
  await expect(right.getByRole("cell")).toHaveText([
    /Pro-grip glove\s*Right\s*grip-right/,
    "GRIP-R",
    "50",
    "$8.50",
    "$425.00",
    ""
  ])
  await expect(page.getByText("Shipments start once the purchase order is sent.")).toBeVisible()

  const aside = page.getByRole("complementary")
  await expect(aside).toContainText("2 variants (150 units)")
  await expect(aside).toContainText("Total$1,275.00")
  await expect(aside).toContainText("Required byJan 15, 2027")
  await expect(aside).toContainText("Payment termsNet 30")
  await expect(aside).toContainText("CurrencyUSD")
  await expect(aside).toContainText("No costs yet")

  await page.getByRole("button", { name: "More actions for E2E-DRAFT" }).click()
  const menu = page.getByRole("menu", { name: "More actions for E2E-DRAFT" })
  await expect(menu.getByRole("menuitem", { name: "Edit" })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Delete draft" })).toBeVisible()
  const po = await download(page, () => menu.getByRole("menuitem", { name: "Download purchase order" }).click())
  expect(po.name).toBe("E2E-DRAFT.pdf")
  await expectPdf(po.bytes)

  // The seeded gloves have no suffocation warning, so their lines offer no hazard label.
  await page.getByRole("button", { name: "More for Pro-grip glove / Left" }).click()
  const lineMenu = page.getByRole("menu", { name: "More for Pro-grip glove / Left" })
  await expect(lineMenu.getByRole("menuitem", { name: "Download label" })).toBeVisible()
  await expect(lineMenu.getByRole("menuitem", { name: "Edit" })).toBeVisible()
  await expect(lineMenu.getByRole("menuitem", { name: "Download hazard label" })).toHaveCount(0)
  await page.keyboard.press("Escape")

  const timeline = page.getByRole("region", { name: "Timeline" })
  await expect(timeline.getByRole("button", { name: "Purchase order created" })).toBeVisible()
  const comment = timeline.getByRole("textbox", { name: "Comment" })
  const post = timeline.getByRole("button", { name: "Post" })
  await expect(post).toBeDisabled()
  await comment.fill("   ")
  await expect(post).toBeDisabled()
  const text = unique("Please confirm the carton marks")
  await comment.fill(text)
  await post.click()
  const posted = timeline.getByRole("listitem").filter({ hasText: text })
  await expect(posted).toContainText("Casey Tester")
  await expect(comment).toHaveValue("")
  await page.reload()
  await expect(posted).toBeVisible()
})

test("editing a draft opens the builder with its values", async ({ page }) => {
  const url = await openOrder(page, "E2E-DRAFT")
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page).toHaveURL(`${url}/edit`)
  await expect(page.getByRole("heading", { level: 1, name: "Edit" })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("E2E-DRAFT")

  await expect(page.getByRole("combobox", { name: "Supplier", exact: true })).toContainText("Demo supplier")
  await expect(page.getByRole("combobox", { name: "Destination" })).toContainText("Your location")
  await expect(page.getByRole("combobox", { name: "Delivery address" })).toContainText("E2E Buyer address")
  await expect(page.getByRole("combobox", { name: "Payment terms" })).toContainText("Net 30")
  await expect(page.getByRole("combobox", { name: "Supplier currency" })).toContainText("US Dollar (USD $)")
  await expect(page.getByRole("textbox", { name: "Reference number" })).toHaveValue("E2E-DRAFT")
  await expect(page.getByRole("textbox", { name: "Required by" })).toHaveValue("2027-01-15")
  const skus = page.getByRole("textbox", { name: "Supplier SKU for Pro-grip glove" })
  await expect(skus.first()).toHaveValue("GRIP-L")
  await expect(skus.last()).toHaveValue("GRIP-R")
  const quantities = page.getByRole("spinbutton", { name: "Quantity of Pro-grip glove" })
  await expect(quantities).toHaveCount(2)
  await expect(quantities.first()).toHaveValue("100")
  await expect(quantities.last()).toHaveValue("50")
  await expect(page.getByRole("spinbutton", { name: "Cost of Pro-grip glove" }).first()).toHaveValue("8.50")
  await expect(page.getByText("2 variants (150 units)")).toBeVisible()

  // Saving waits for a change, and a draft without its reference doesn't save (saving itself calls Shopify).
  const save = page.getByRole("button", { name: "Save" })
  await expect(save).toBeDisabled()
  await page.getByRole("textbox", { name: "Reference number" }).fill("")
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByRole("textbox", { name: "Reference number" })).toHaveAttribute("aria-invalid", "true")
  await expect(page).toHaveURL(`${url}/edit`)

  await page.getByRole("button", { name: "Discard" }).click()
  await expect(page).toHaveURL(url)
  await expect(page.getByRole("heading", { level: 1, name: "E2E-DRAFT" })).toBeVisible()
})

test("deleting a draft asks first, then removes it from the list", async ({ page }) => {
  await openOrder(page, "E2E-DELETE")
  const actions = page.getByRole("button", { name: "More actions for E2E-DELETE" })
  const dialog = page.getByRole("alertdialog", { name: "Delete E2E-DELETE?" })

  await actions.click()
  await page.getByRole("menuitem", { name: "Delete draft" }).click()
  await expect(dialog).toContainText("Your supplier hasn’t seen it. You can’t undo this.")
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("heading", { level: 1, name: "E2E-DELETE" })).toBeVisible()

  await actions.click()
  await page.getByRole("menuitem", { name: "Delete draft" }).click()
  await dialog.getByRole("button", { name: "Delete draft" }).click()
  await expect(page).toHaveURL(/\/orders$/)
  await expect(page.getByRole("link", { name: "E2E-DRAFT", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "E2E-DELETE", exact: true })).toHaveCount(0)
})

test("the new purchase order builder picks a route and needs products to save", async ({ page }) => {
  await page.goto("/orders")
  await page.getByRole("button", { name: "Create purchase order" }).click()
  await expect(page).toHaveURL(/\/orders\/new$/)
  await expect(page.getByRole("heading", { level: 1, name: "New purchase order" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "No products" })).toBeVisible()
  await expect(page.getByText("0 variants (0 units)")).toBeVisible()
  const save = page.getByRole("button", { name: "Save" })
  await expect(save).toBeDisabled()

  const supplier = page.getByRole("combobox", { name: "Supplier", exact: true })
  await expect(supplier).toContainText("Choose supplier")
  await supplier.click()
  await expect(page.getByRole("option", { name: "Offline supplier" })).toBeVisible()
  await page.getByRole("option", { name: "Demo supplier" }).click()
  await expect(supplier).toContainText("Demo supplier")

  const destination = page.getByRole("combobox", { name: "Destination" })
  await expect(destination).toContainText("Amazon")
  await expect(page.getByRole("combobox", { name: "Delivery address" })).toHaveCount(0)
  await destination.click()
  await page.getByRole("option", { name: "Your location" }).click()
  const address = page.getByRole("combobox", { name: "Delivery address" })
  await expect(address).toContainText("Choose address")
  await address.click()
  await page.getByRole("option", { name: "E2E Buyer address" }).click()
  await expect(address).toContainText("E2E Buyer address")

  await page.getByRole("button", { name: "Add stop" }).click()
  const stop = page.getByRole("combobox", { name: "Stop on the way" })
  await expect(stop).toContainText("Choose forwarder")
  await stop.click()
  await page.getByRole("option", { name: "E2E Forwarder, E2E Forwarder address" }).click()
  await expect(stop).toContainText("E2E Forwarder, E2E Forwarder address")
  await page.getByRole("button", { name: "Remove the stop" }).click()
  await expect(stop).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Add stop" })).toBeVisible()

  await expect(page.getByRole("combobox", { name: "Payment terms" })).toContainText("Payment in advance")
  await page.getByRole("textbox", { name: "Reference number" }).fill(unique("PO"))
  // A purchase order needs at least one product before it saves.
  await expect(save).toBeDisabled()
  await page.getByRole("button", { name: "Discard" }).click()
  await expect(page).toHaveURL(/\/orders$/)
})
