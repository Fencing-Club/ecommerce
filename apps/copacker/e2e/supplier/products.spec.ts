import type { Page } from "@playwright/test"
import { expect, test, unique } from "../fixtures"
import { pngFile } from "../support/files"
import { createProduct, uniqueSku } from "./support"

test.use({ role: "supplier" })

const saveBar = (page: Page) => page.getByRole("region", { name: "Unsaved changes" })

// The products list, searched down to one product's row.
async function productRow(page: Page, title: string) {
  await page.goto("/products")
  await page.getByRole("searchbox", { name: "Search products" }).fill(title)
  return page.getByRole("row").filter({ has: page.getByRole("link", { name: title, exact: true }) })
}

test("a new supplier sees the first product prompt", async ({ page }) => {
  await page.goto("/products")
  const prompt = page.getByText("Add your first product", { exact: true })
  await expect(prompt.or(page.getByRole("searchbox", { name: "Search products" }))).toBeVisible()
  test.skip(!(await prompt.isVisible()), "Only a freshly seeded supplier has no products")
  await expect(
    page.getByText("Customers order from your products. Add them one at a time or import a spreadsheet.")
  ).toBeVisible()
  for (const button of await page.getByRole("button", { name: "Add product" }).all()) {
    await expect(button).toHaveAttribute("href", "/products/new")
  }
})

test("creates a product from Add product", async ({ page }) => {
  const title = unique("E2E New product")
  await page.goto("/products")
  await page.getByRole("button", { name: "Add product" }).first().click()
  await expect(page.getByRole("heading", { name: "Add product", level: 1 })).toBeVisible()
  const save = saveBar(page).getByRole("button", { name: "Save" })
  await save.click()
  await expect(saveBar(page)).toContainText("Add a title")
  await page.getByRole("textbox", { name: "Title" }).fill(title)
  await save.click()
  await expect(saveBar(page)).toContainText("Give every variant a SKU")
  await page.getByRole("textbox", { name: "SKU for new variant" }).fill(uniqueSku("NEW"))
  await save.click()
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible()
  const row = await productRow(page, title)
  await expect(row).toContainText("No price")
})

test("leaves a new product unsaved with Discard", async ({ page }) => {
  const title = unique("E2E Discarded")
  await page.goto("/products/new")
  await page.getByRole("textbox", { name: "Title" }).fill(title)
  await saveBar(page).getByRole("button", { name: "Discard" }).click()
  await expect(page).toHaveURL(/\/products$/)
  await page.getByRole("searchbox", { name: "Search products" }).fill(title)
  await expect(page.getByText("No products found")).toBeVisible()
})

test("builds out a product with photos, options, variants and volume pricing", async ({ page }) => {
  const title = unique("E2E Grip glove")
  const first = uniqueSku("GLV")
  const right = uniqueSku("GLV-R")
  const id = await createProduct(page, { title, variants: [{ sku: first }] })
  await page.goto(`/products/${id}`)
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible()
  await page.getByRole("textbox", { name: "Description" }).fill("Tacky palm, sold by the pack.")

  // Photos upload as soon as they're picked, and show as thumbnails.
  const chooser = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Add photos" }).click()
  await (await chooser).setFiles(pngFile("glove-front.png"))
  const photo = page.getByRole("img", { name: "glove-front.png" })
  await expect(photo).toBeVisible()
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)

  // Something that isn't a photo is turned away, and the photo already added stays.
  const second = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Add", exact: true }).first().click()
  await (await second).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") })
  await expect(page.getByText("notes.txt: Upload a JPG, PNG, WebP or GIF photo")).toBeVisible()
  await expect(photo).toBeVisible()

  // An option makes the product's variants: the first becomes Left.
  await page.getByRole("textbox", { name: "New option name" }).fill("Hand")
  await page.getByRole("textbox", { name: "New option name" }).press("Enter")
  await expect(page.getByRole("button", { name: "Remove option Hand" })).toBeVisible()
  await page.getByRole("textbox", { name: `Hand for ${first}` }).fill("Left")
  await page.getByRole("textbox", { name: "Price for Left" }).fill("12.5")
  await page.getByRole("textbox", { name: "Price for Left" }).blur()
  await expect(page.getByRole("textbox", { name: "Price for Left" })).toHaveValue("12.50")

  // The variant's panel has its packaging, stock and volume pricing.
  await page.getByRole("button", { name: "Actions for Left" }).click()
  await page.getByRole("menuitem", { name: "Edit variant" }).click()
  const sheet = page.getByRole("dialog", { name: "Left" })
  await expect(sheet.getByRole("textbox", { name: "SKU" })).toHaveValue(first)
  await expect(sheet.getByRole("combobox", { name: "Currency" })).toContainText("USD")
  await sheet.getByRole("combobox", { name: "Price per" }).click()
  await page.getByRole("option", { name: "Pack" }).click()
  await sheet.getByRole("spinbutton", { name: "Units per pack" }).fill("2")
  await sheet.getByRole("switch", { name: "Track inventory" }).click()
  await sheet.getByRole("spinbutton", { name: "On hand" }).fill("40")
  await expect(sheet.getByRole("switch", { name: "Continue selling when out of stock" })).not.toBeChecked()

  await sheet.getByRole("button", { name: "Add rules" }).click()
  const rules = page.getByRole("dialog", { name: "Quantity rules and volume pricing" })
  await expect(rules.getByRole("textbox", { name: "Base price" })).toHaveValue("$12.50")
  await rules.getByRole("spinbutton", { name: "Minimum" }).fill("10")
  await rules.getByRole("button", { name: "Add break" }).click()
  await rules.getByRole("spinbutton", { name: "Break 1 quantity" }).fill("50")
  // A break must cost less than the price before it.
  await rules.getByRole("textbox", { name: "Break 1 price" }).fill("13.00")
  await expect(rules.getByRole("alert")).toHaveText("Each break's price must be lower than the one before")
  await expect(rules.getByRole("button", { name: "Done" })).toBeDisabled()
  await rules.getByRole("textbox", { name: "Break 1 price" }).fill("11.00")
  await expect(rules.getByRole("alert")).toBeHidden()
  await rules.getByRole("button", { name: "Done" }).click()
  await expect(rules).toBeHidden()
  await expect(sheet.getByRole("button", { name: "1 price break, min 10 packs" })).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(sheet).toBeHidden()

  // Add variant copies the last variant's price and opens its panel.
  await page.getByRole("button", { name: "Add variant" }).click()
  const added = page.getByRole("dialog", { name: "Variant" })
  await added.getByRole("textbox", { name: "Hand" }).fill("Right")
  // The panel takes the variant's name.
  const named = page.getByRole("dialog", { name: "Right" })
  await named.getByRole("textbox", { name: "SKU" }).fill(right)
  await expect(named.getByRole("textbox", { name: "Price" })).toHaveValue("12.50")
  await named.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("textbox", { name: "SKU for Right" })).toHaveValue(right)
  await expect(page.getByText("New variants join the catalogs this product is in.")).toBeVisible()

  await expect(page.getByRole("combobox", { name: "Status" })).toContainText("Active")
  await saveBar(page).getByRole("button", { name: "Save" }).click()
  await expect(saveBar(page)).toBeHidden()
  await page.reload()
  await expect(page.getByRole("img", { name: "glove-front.png" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Description" })).toHaveValue("Tacky palm, sold by the pack.")
  await expect(page.getByRole("textbox", { name: "SKU for Right" })).toHaveValue(right)
  await expect(page.getByText("Not in any catalog.")).toBeVisible()

  // The saved variant keeps what its panel set.
  await page.getByRole("button", { name: "Actions for Left" }).click()
  await page.getByRole("menuitem", { name: "Edit variant" }).click()
  await expect(sheet.getByRole("combobox", { name: "Price per" })).toContainText("Pack")
  await expect(sheet.getByRole("spinbutton", { name: "Units per pack" })).toHaveValue("2")
  await expect(sheet.getByRole("spinbutton", { name: "On hand" })).toHaveValue("40")
  await expect(sheet.getByRole("button", { name: "1 price break, min 10 packs" })).toBeVisible()
  await sheet.getByRole("button", { name: "Cancel" }).click()

  const row = await productRow(page, title)
  await expect(row).toContainText("2 variants")
  await expect(row).toContainText("Active")
  await expect(row).toContainText("$12.50 / pack")
  await expect(row).toContainText("40 in stock")
  // The row shows the main photo as its thumbnail, which has no alt text of its own.
  await expect(row.locator("img")).toHaveAttribute("src", /^\/api\/product-images\?key=/)
})

test("filters the list by tab and search", async ({ page }) => {
  const prefix = unique("E2E Tabs")
  const active = `${prefix} active`
  const archived = `${prefix} archived`
  await createProduct(page, { title: active, variants: [{ sku: uniqueSku("TAB-A"), price: 5 }] })
  const archivedSku = uniqueSku("TAB-B")
  await createProduct(page, { title: archived, status: "archived", variants: [{ sku: archivedSku, price: 6 }] })

  await page.goto("/products")
  const search = page.getByRole("searchbox", { name: "Search products" })
  const link = (title: string) => page.getByRole("link", { name: title, exact: true })
  await search.fill(prefix)
  await expect(link(active)).toBeVisible()
  await expect(link(archived)).toBeVisible()

  await page.getByRole("tab", { name: /^Active/ }).click()
  await expect(link(active)).toBeVisible()
  await expect(link(archived)).toBeHidden()

  await page.getByRole("tab", { name: /^Archived/ }).click()
  await expect(link(archived)).toBeVisible()
  await expect(link(active)).toBeHidden()

  // Search matches a variant's SKU too.
  await page.getByRole("tab", { name: /^All/ }).click()
  await search.fill(archivedSku.toLowerCase())
  await expect(link(archived)).toBeVisible()
  await expect(link(active)).toBeHidden()

  await search.fill(`${prefix} nothing like it`)
  await expect(page.getByText("No products found")).toBeVisible()
  await expect(page.getByText("Try another search or tab.")).toBeVisible()
})

test("edits a product, discarding and then saving a change", async ({ page }) => {
  const title = unique("E2E Edit")
  const sku = uniqueSku("EDIT")
  const id = await createProduct(page, { title, variants: [{ sku, price: 9 }] })
  await page.goto(`/products/${id}`)
  const price = page.getByRole("textbox", { name: `Price for ${sku}` })
  await expect(price).toHaveValue("9.00")
  await expect(saveBar(page)).toBeHidden()

  await price.fill("10.25")
  await price.blur()
  await expect(saveBar(page)).toBeVisible()
  await saveBar(page).getByRole("button", { name: "Discard" }).click()
  await expect(saveBar(page)).toBeHidden()
  await expect(price).toHaveValue("9.00")

  await price.fill("10.25")
  await price.blur()
  await page.getByRole("textbox", { name: "Category" }).fill("Gloves")
  await saveBar(page).getByRole("button", { name: "Save" }).click()
  await expect(saveBar(page)).toBeHidden()
  await page.reload()
  await expect(price).toHaveValue("10.25")
  await expect(page.getByRole("textbox", { name: "Category" })).toHaveValue("Gloves")

  const row = await productRow(page, title)
  await expect(row).toContainText("$10.25")
  await expect(row).toContainText("Gloves")
})

test("archives products in bulk and sets them active again", async ({ page }) => {
  const prefix = unique("E2E Bulk")
  const first = `${prefix} one`
  const second = `${prefix} two`
  await createProduct(page, { title: first, variants: [{ sku: uniqueSku("BULK-1"), price: 3 }] })
  await createProduct(page, { title: second, variants: [{ sku: uniqueSku("BULK-2"), price: 4 }] })

  await page.goto("/products")
  await page.getByRole("searchbox", { name: "Search products" }).fill(prefix)
  const row = (title: string) =>
    page.getByRole("row").filter({ has: page.getByRole("link", { name: title, exact: true }) })
  await page.getByRole("checkbox", { name: `Select ${first}` }).check()
  await page.getByRole("checkbox", { name: `Select ${second}` }).check()
  await expect(page.getByText("2 selected")).toBeVisible()
  await page.getByRole("button", { name: "Archive", exact: true }).click()
  await expect(page.getByText("2 selected")).toBeHidden()
  await expect(row(first)).toContainText("Archived")
  await expect(row(second)).toContainText("Archived")

  await page.getByRole("tab", { name: /^Archived/ }).click()
  await expect(row(first)).toBeVisible()
  await page.getByRole("checkbox", { name: `Select ${first}` }).check()
  await page.getByRole("checkbox", { name: `Select ${second}` }).check()
  await page.getByRole("button", { name: "Set as active" }).click()
  await expect(row(first)).toBeHidden()
  await expect(row(second)).toBeHidden()

  await page.getByRole("tab", { name: /^Active/ }).click()
  await expect(row(first)).toContainText("Active")
  await expect(row(second)).toContainText("Active")
})

test("won't save a product without a title, a SKU or with another product's SKU", async ({ page }) => {
  const taken = uniqueSku("TAKEN")
  await createProduct(page, { title: unique("E2E Taken"), variants: [{ sku: taken, price: 2 }] })
  const title = unique("E2E Duplicate")
  const sku = uniqueSku("DUP")
  const id = await createProduct(page, { title, variants: [{ sku, price: 2 }] })

  await page.goto(`/products/${id}`)
  const save = saveBar(page).getByRole("button", { name: "Save" })
  const titleField = page.getByRole("textbox", { name: "Title" })
  await titleField.fill("")
  await save.click()
  await expect(saveBar(page)).toContainText("Add a title")
  await titleField.fill(title)

  await page.getByRole("textbox", { name: `SKU for ${sku}` }).fill("")
  await save.click()
  await expect(saveBar(page)).toContainText("Give every variant a SKU")

  await page.getByRole("textbox", { name: "SKU for new variant" }).fill(taken)
  await save.click()
  await expect(saveBar(page)).toContainText(`Another product uses SKU ${taken}`)

  // Discard puts the saved SKU back, and nothing changed.
  await saveBar(page).getByRole("button", { name: "Discard" }).click()
  await expect(saveBar(page)).toBeHidden()
  await expect(page.getByRole("textbox", { name: `SKU for ${sku}` })).toHaveValue(sku)
  await page.reload()
  await expect(page.getByRole("textbox", { name: `SKU for ${sku}` })).toHaveValue(sku)
})

test("a product photo is readable by the buyer it supplies, not by others", async ({ page, pageFor }) => {
  // Signing in to two more workspaces takes a while.
  test.slow()
  const id = await createProduct(page, { title: unique("E2E Photo"), variants: [{ sku: uniqueSku("PHOTO") }] })
  await page.goto(`/products/${id}`)
  const chooser = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Add photos" }).click()
  await (await chooser).setFiles(pngFile("shared-photo.png"))
  const photo = page.getByRole("img", { name: "shared-photo.png" })
  await expect(photo).toBeVisible()
  await saveBar(page).getByRole("button", { name: "Save" }).click()
  await expect(saveBar(page)).toBeHidden()
  const src = (await photo.getAttribute("src")) ?? ""
  expect(src).toMatch(/^\/api\/product-images\?key=/)

  // E2E Buyer orders from this supplier, so its pages may load the photo; the forwarder's may not.
  const load = (other: Page) =>
    other.evaluate(async (url) => {
      const response = await fetch(url)
      const bytes = new Uint8Array(await response.arrayBuffer())
      return {
        status: response.status,
        type: response.headers.get("content-type"),
        magic: String.fromCharCode(...bytes.slice(1, 4))
      }
    }, src)
  const buyer = await pageFor("buyer")
  await buyer.goto("/overview")
  await expect(buyer.getByRole("button", { name: /E2E Buyer/ }).first()).toBeVisible()
  expect(await load(buyer)).toEqual({ status: 200, type: "image/png", magic: "PNG" })
  const forwarder = await pageFor("forwarder")
  await forwarder.goto("/orders")
  await expect(forwarder.getByRole("button", { name: /E2E Forwarder/ }).first()).toBeVisible()
  expect((await load(forwarder)).status).toBe(404)
})
