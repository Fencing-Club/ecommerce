import type { Page } from "@playwright/test"
import { expect, test, unique } from "../fixtures"
import { createProduct, uniqueSku } from "./support"

test.use({ role: "supplier" })

const saveBar = (page: Page) => page.getByRole("region", { name: "Unsaved changes" })
const rowFor = (page: Page, sku: string) =>
  page.getByRole("row").filter({ has: page.getByRole("cell", { name: sku, exact: true }) })

// A tracked product in Left and Right, and an untracked one, all with unique SKUs.
async function stock(page: Page) {
  const title = unique("E2E Stock")
  const left = uniqueSku("STK-L")
  const right = uniqueSku("STK-R")
  const loose = uniqueSku("STK-U")
  await createProduct(page, {
    title,
    optionNames: ["Hand"],
    variants: [
      { sku: left, options: { Hand: "Left" }, price: 4, track: true, onHand: 12 },
      { sku: right, options: { Hand: "Right" }, price: 4, track: true, onHand: -3 }
    ]
  })
  await createProduct(page, { title: `${title} untracked`, variants: [{ sku: loose, price: 2 }] })
  await page.goto("/inventory")
  await page.getByRole("searchbox", { name: "Search by product or SKU" }).fill(title)
  return { title, left, right, loose }
}

test("sorts variants into tracked, short and not tracked", async ({ page }) => {
  const { title, left, right, loose } = await stock(page)
  await expect(rowFor(page, left)).toContainText("Left")
  await expect(rowFor(page, right)).toContainText("Right")
  await expect(rowFor(page, loose)).toContainText("Not tracked")

  await page.getByRole("tab", { name: /^Tracked/ }).click()
  await expect(rowFor(page, left)).toBeVisible()
  await expect(rowFor(page, right)).toBeVisible()
  await expect(rowFor(page, loose)).toBeHidden()

  // Right has less on hand than nothing, so it's short.
  await page.getByRole("tab", { name: /^Short/ }).click()
  await expect(rowFor(page, right)).toBeVisible()
  await expect(rowFor(page, left)).toBeHidden()

  await page.getByRole("tab", { name: /^Not tracked/ }).click()
  await expect(rowFor(page, loose)).toBeVisible()
  await expect(rowFor(page, left)).toBeHidden()

  // Search finds a SKU, and says so when nothing matches.
  await page.getByRole("tab", { name: /^All/ }).click()
  const search = page.getByRole("searchbox", { name: "Search by product or SKU" })
  await search.fill(right.toLowerCase())
  await expect(rowFor(page, right)).toBeVisible()
  await expect(rowFor(page, left)).toBeHidden()
  await search.fill(`${title} nothing like it`)
  await expect(page.getByText("Nothing here")).toBeVisible()
})

test("turns tracking and selling when out on and off", async ({ page }) => {
  const { loose, left } = await stock(page)
  const track = page.getByRole("switch", { name: `Track inventory for ${loose}` })
  await expect(track).not.toBeChecked()
  await track.click()
  await expect(track).toBeChecked()
  await expect(page.getByRole("spinbutton", { name: `On hand for ${loose}` })).toBeVisible()

  const sell = page.getByRole("switch", { name: `Continue selling for ${left}` })
  await expect(sell).not.toBeChecked()
  await sell.click()
  await expect(sell).toBeChecked()

  await page.reload()
  await page.getByRole("searchbox", { name: "Search by product or SKU" }).fill(loose)
  await expect(page.getByRole("switch", { name: `Track inventory for ${loose}` })).toBeChecked()
  await page.getByRole("switch", { name: `Track inventory for ${loose}` }).click()
  await expect(page.getByRole("switch", { name: `Track inventory for ${loose}` })).not.toBeChecked()
  await expect(rowFor(page, loose)).toContainText("Not tracked")
  await page.getByRole("searchbox", { name: "Search by product or SKU" }).fill(left)
  await expect(page.getByRole("switch", { name: `Continue selling for ${left}` })).toBeChecked()
})

test("edits on hand counts with the save bar", async ({ page }) => {
  const { title, left, right } = await stock(page)
  const leftCount = page.getByRole("spinbutton", { name: `On hand for ${left}` })
  const rightCount = page.getByRole("spinbutton", { name: `On hand for ${right}` })
  await expect(leftCount).toHaveValue("12")
  await expect(saveBar(page)).toBeHidden()

  await leftCount.fill("20")
  await expect(rowFor(page, left)).toContainText("+8")
  await expect(saveBar(page)).toContainText("1 unsaved change")
  await rightCount.fill("0")
  await expect(saveBar(page)).toContainText("2 unsaved changes")

  // A count that isn't a whole number can't be saved.
  await rightCount.fill("")
  await expect(saveBar(page)).toContainText("Enter whole numbers to save")
  await expect(saveBar(page).getByRole("button", { name: "Save" })).toBeDisabled()

  await saveBar(page).getByRole("button", { name: "Discard" }).click()
  await expect(saveBar(page)).toBeHidden()
  await expect(leftCount).toHaveValue("12")
  await expect(rightCount).toHaveValue("-3")

  await leftCount.fill("20")
  await rightCount.fill("5")
  await saveBar(page).getByRole("button", { name: "Save" }).click()
  await expect(saveBar(page)).toBeHidden()
  await page.reload()
  await page.getByRole("searchbox", { name: "Search by product or SKU" }).fill(title)
  await expect(leftCount).toHaveValue("20")
  await expect(rightCount).toHaveValue("5")
  // Neither is short any more.
  await page.getByRole("tab", { name: /^Short/ }).click()
  await expect(rowFor(page, right)).toBeHidden()
})
