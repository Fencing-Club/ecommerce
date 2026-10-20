import type { Page } from "@playwright/test"
import { expect } from "../fixtures"

export async function fillCarton(page: Page, carton: string, fields: Record<string, string>) {
  for (const [field, value] of Object.entries(fields)) {
    await page.getByRole("spinbutton", { name: `Carton ${carton}: ${field}`, exact: true }).fill(value)
  }
}

export async function addCartonProduct(page: Page, carton: string, variant: string, sku: string, quantity: string) {
  await page.getByRole("button", { name: `Add products to carton ${carton}`, exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Add products to carton", exact: true })
  await dialog.getByRole("checkbox", { name: `Pro-grip glove ${variant}`, exact: true }).check()
  await dialog.getByRole("button", { name: "Add to carton", exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole("spinbutton", { name: `${sku}: quantity per carton ${carton}`, exact: true }).fill(quantity)
}
