import type { Page } from "@playwright/test"
import { expect } from "../fixtures"

// Opens a purchase order from the workspace's purchase order list by its reference, as someone would.
export async function openOrder(page: Page, reference: string) {
  await page.goto("/orders")
  await page.getByRole("link", { name: reference, exact: true }).click()
  await expect(page.getByRole("heading", { level: 1, name: reference })).toBeVisible()
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/)
  return page.url()
}

// The status badge beside a page's title. The badge has no role of its own, so it's found by its place after the title.
export function titleStatus(page: Page) {
  return page.locator("h1 + [data-slot='status']")
}

// A day a few weeks out, as a date input takes it.
export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}
