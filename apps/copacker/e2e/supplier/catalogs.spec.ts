import type { Page } from "@playwright/test"
import { expect, test, unique } from "../fixtures"
import { download, expectPdf, xlsxRows } from "../support/files"
import { createProduct, uniqueSku, withCustomer } from "./support"

test.use({ role: "supplier" })

const saveBar = (page: Page) => page.getByRole("region", { name: "Unsaved changes" })

// Leaves only these products in the catalog being edited: every product starts included, and others' come and go.
async function includeOnly(page: Page, prefix: string, titles: string[]) {
  const included = page.getByRole("tab", { name: /^Included/ })
  await included.click()
  for (;;) {
    const count = (await included.textContent())?.replace(/\D/g, "")
    if (count === "0") {
      break
    }
    await page.getByRole("checkbox", { name: "Select all products on this page" }).check()
    await page.getByRole("button", { name: "Exclude", exact: true }).click()
    await expect(included).not.toHaveText(`Included${count}`)
  }
  await page.getByRole("tab", { name: /^Excluded/ }).click()
  await page.getByRole("searchbox", { name: "Search products" }).fill(prefix)
  for (const title of titles) {
    await page.getByRole("checkbox", { name: `Select ${title}` }).check()
  }
  await page.getByRole("button", { name: "Include", exact: true }).click()
  await included.click()
}

test("a supplier without catalogs is asked to create one", async ({ page }) => {
  await page.goto("/catalogs")
  const empty = page.getByText("No catalogs yet", { exact: true })
  await expect(empty.or(page.getByRole("searchbox", { name: "Search catalogs" }))).toBeVisible()
  test.skip(!(await empty.isVisible()), "Only a freshly seeded supplier has no catalogs")
  await expect(page.getByText("Set which products each customer can order, and their prices.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Create catalog" })).toHaveAttribute("href", "/catalogs/new")
})

test("won't save a catalog without a title or with an adjustment out of range", async ({ page }) => {
  await page.goto("/catalogs/new")
  await expect(page.getByRole("heading", { name: "New catalog", level: 1 })).toBeVisible()
  const save = saveBar(page).getByRole("button", { name: "Save" })
  await save.click()
  await expect(saveBar(page)).toContainText("Add a title")
  await page.getByRole("textbox", { name: "Title" }).fill(unique("E2E Invalid catalog"))
  await page.getByRole("textbox", { name: "Price adjustment" }).fill("150")
  await expect(page.getByText("Enter 0 to 100.")).toBeVisible()
  await save.click()
  await expect(saveBar(page)).toContainText("Decrease by 0 to 100%")
  await saveBar(page).getByRole("button", { name: "Discard" }).click()
  await expect(page).toHaveURL(/\/catalogs$/)
})

test("creates a catalog for E2E Buyer, edits it, exports it and deletes it", async ({ page }) => {
  test.setTimeout(240_000)
  const prefix = unique("E2E Catalog item")
  const [cord, glove, shoe] = ["cord", "glove", "shoe"].map((name) => `${prefix} ${name}`)
  await createProduct(page, { title: cord!, variants: [{ sku: uniqueSku("CAT-C"), price: 20 }] })
  await createProduct(page, { title: glove!, variants: [{ sku: uniqueSku("CAT-G"), price: 40 }] })
  await createProduct(page, { title: shoe!, variants: [{ sku: uniqueSku("CAT-S"), price: 60 }] })
  const title = unique("E2E Catalog")

  await withCustomer(async () => {
    await page.goto("/catalogs/new")
    await page.getByRole("textbox", { name: "Title" }).fill(title)
    // Drafts don't apply, so E2E Buyer's prices elsewhere in the suite stay as they are.
    await page.getByRole("combobox", { name: "Status" }).click()
    await page.getByRole("option", { name: "Draft" }).click()
    await page.getByRole("combobox", { name: "Add customers" }).click()
    await page.getByRole("option", { name: /^E2E Buyer/ }).click()
    await page.keyboard.press("Escape")
    await expect(
      page.getByText("Customers see every active product at its own price until the catalog is active.")
    ).toBeVisible()

    await expect(page.getByRole("combobox", { name: "Adjustment direction" })).toContainText("Decrease by")
    await page.getByRole("textbox", { name: "Price adjustment" }).fill("10")
    await expect(page.getByText("Applies to every price you don’t fix below. $100.00 becomes $90.00.")).toBeVisible()
    await page.getByRole("switch", { name: "Automatically include new products" }).click()
    await includeOnly(page, prefix, [cord!, glove!, shoe!])

    // Each price follows the adjustment until it's fixed.
    await expect(page.getByRole("button", { name: `Price for ${cord}: $18.00` })).toBeVisible()
    await page.getByRole("button", { name: `Price for ${glove}: $36.00` }).click()
    await page.getByRole("textbox", { name: "Fixed price" }).fill("30")
    await page.getByRole("button", { name: "Done" }).click()
    await expect(page.getByRole("button", { name: `Price for ${glove}: $30.00, fixed` })).toBeVisible()
    // The glove's price field closes with an animation; wait for it to go before opening the cord's.
    await expect(page.getByRole("textbox", { name: "Fixed price" })).toHaveCount(0)
    await page.getByRole("button", { name: `Price for ${cord}: $18.00` }).click()
    await page.getByRole("textbox", { name: "Fixed price" }).fill("15")
    await page.getByRole("button", { name: "Done" }).click()
    await expect(page.getByRole("button", { name: `Price for ${cord}: $15.00, fixed` })).toBeVisible()

    // Clearing the cord's override puts it back on the adjusted price; the shoe is left out.
    await page.getByRole("checkbox", { name: `Select ${cord}` }).check()
    await page.getByRole("button", { name: "Clear price overrides" }).click()
    await expect(page.getByRole("button", { name: `Price for ${cord}: $18.00` })).toBeVisible()
    await page.getByRole("checkbox", { name: `Select ${shoe}` }).check()
    await page.getByRole("button", { name: "Exclude", exact: true }).click()
    await expect(page.getByText(shoe!, { exact: true })).toBeHidden()
    await page.getByRole("tab", { name: /^Excluded/ }).click()
    await expect(page.getByText(shoe!, { exact: true })).toBeVisible()

    await saveBar(page).getByRole("button", { name: "Save" }).click()
    await expect(page).toHaveURL(/\/catalogs\/[0-9a-f-]{36}$/)
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible()
    await expect(saveBar(page)).toBeHidden()

    await page.goto("/catalogs")
    await page.getByRole("searchbox", { name: "Search catalogs" }).fill(title)
    const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: title, exact: true }) })
    await expect(row.getByRole("cell")).toHaveText([title, "Draft", "E2E Buyer", "1", "10% off", "2"])

    // Reopened, the adjustment changes to 20% off.
    await row.getByRole("link", { name: title }).click()
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible()
    await page.getByRole("textbox", { name: "Price adjustment" }).fill("20")
    await saveBar(page).getByRole("button", { name: "Save" }).click()
    await expect(saveBar(page)).toBeHidden()
    await page.reload()
    await expect(page.getByRole("button", { name: `Price for ${cord}: $16.00` })).toBeVisible()

    await page.getByRole("button", { name: "More actions" }).click()
    const excel = await download(page, () => page.getByRole("menuitem", { name: "Export to Excel" }).click())
    expect(excel.name).toBe(`${title} price list.xlsx`)
    const rows = await xlsxRows(excel.bytes)
    expect(rows[1]?.[0]).toBe(`${title} price list`)
    expect(rows[2]?.[0]).toContain("Prepared for E2E Buyer")
    expect(rows.find((cells) => cells[0] === cord)?.[4]).toBe("16")
    expect(rows.find((cells) => cells[0] === glove)?.[4]).toBe("30")
    expect(rows.some((cells) => cells[0] === shoe)).toBe(false)

    await page.getByRole("button", { name: "More actions" }).click()
    const pdf = await download(page, () => page.getByRole("menuitem", { name: "Export to PDF" }).click())
    expect(pdf.name).toBe(`${title} price list.pdf`)
    await expectPdf(pdf.bytes)

    await page.getByRole("button", { name: "More actions" }).click()
    await page.getByRole("menuitem", { name: "Delete catalog" }).click()
    const confirm = page.getByRole("alertdialog", { name: `Delete ${title}?` })
    await confirm.getByRole("button", { name: "Delete catalog" }).click()
    await expect(page).toHaveURL(/\/catalogs$/)
  })
  const search = page.getByRole("searchbox", { name: "Search catalogs" })
  const empty = page.getByText("No catalogs yet", { exact: true })
  await expect(search.or(empty)).toBeVisible()
  if (await search.isVisible()) {
    await search.fill(title)
    await expect(page.getByText("No catalogs here")).toBeVisible()
  }
})
