import type { Page } from "@playwright/test"
import { e2eEmail } from "../../scripts/e2e-user"
import { expect, type Role, test } from "../fixtures"

// The sidebar's page links. It has no landmark of its own, so its content area is found by the data attribute the
// shadcn sidebar gives it.
function sidebar(page: Page) {
  return page.locator("[data-sidebar=content]").filter({ visible: true })
}

// Each workspace kind's sidebar, in order: the link's name, its address and the page's heading.
const pages: Record<Role, Array<{ link: string; path: string; heading: string }>> = {
  buyer: [
    { link: "Overview", path: "/overview", heading: "Overview" },
    { link: "Orders", path: "/sales", heading: "Orders" },
    { link: "Products", path: "/products", heading: "Products" },
    { link: "Restock", path: "/restock", heading: "Restock" },
    { link: "Purchase orders", path: "/orders", heading: "Purchase orders" },
    { link: "Shipments", path: "/shipments", heading: "Shipments" },
    { link: "Partners", path: "/partners", heading: "Partners" },
    { link: "Settings", path: "/settings", heading: "Settings" }
  ],
  supplier: [
    { link: "Overview", path: "/overview", heading: "Overview" },
    { link: "Orders", path: "/orders", heading: "Orders" },
    { link: "Shipments", path: "/shipments", heading: "Shipments" },
    { link: "Customers", path: "/customers", heading: "Customers" },
    { link: "Products", path: "/products", heading: "Products" },
    { link: "Inventory", path: "/inventory", heading: "Inventory" },
    { link: "Catalogs", path: "/catalogs", heading: "Catalogs" },
    { link: "Settings", path: "/settings", heading: "Settings" }
  ],
  forwarder: [
    { link: "Purchase orders", path: "/orders", heading: "Purchase orders" },
    { link: "Settings", path: "/settings", heading: "Settings" }
  ]
}

const homes: Record<Role, string> = { buyer: "/overview", supplier: "/orders", forwarder: "/orders" }

for (const role of ["buyer", "supplier", "forwarder"] as const) {
  test.describe(`${role} sidebar`, () => {
    test.use({ role })

    test("every link opens its page and is marked active", async ({ page }) => {
      await page.goto(homes[role])
      const links = sidebar(page).getByRole("link")
      await expect(links).toHaveText(pages[role].map((item) => item.link))
      // Walked from the end, so every click leaves the page it's on.
      for (const item of pages[role].toReversed()) {
        const link = sidebar(page).getByRole("link", { name: item.link, exact: true })
        await link.click()
        await expect(page).toHaveURL(new RegExp(`${item.path}$`))
        await expect(page.getByRole("heading", { level: 1, name: item.heading, exact: true })).toBeVisible()
        await expect(link).toHaveAttribute("data-active", "")
        await expect(sidebar(page).locator("[data-active]")).toHaveCount(1)
      }
    })
  })
}

test.describe("forwarder", () => {
  test.use({ role: "forwarder" })

  test("buyer and supplier pages send it to its purchase orders", async ({ page }) => {
    for (const path of ["/overview", "/sales", "/products", "/restock", "/customers", "/catalogs", "/inventory"]) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/orders$/)
    }
    await expect(page.getByRole("heading", { level: 1, name: "Purchase orders" })).toBeVisible()
  })

  test("Partners is a buyer's page", async ({ page }) => {
    await page.goto("/partners")
    await expect(page.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeVisible()
    await expect(sidebar(page).getByRole("link", { name: "Partners" })).toHaveCount(0)
  })
})

test.describe("buyer portal", () => {
  test.use({ role: "buyer" })

  test("an unknown purchase order or shipment isn't found", async ({ page }) => {
    for (const path of ["/orders/00000000-0000-4000-8000-000000000000", "/shipments/not-a-shipment"]) {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible()
      await expect(page.getByText("It may have been removed, or it’s in another workspace")).toBeVisible()
    }
    await page.getByRole("button", { name: "Go to Overview" }).click()
    await expect(page).toHaveURL(/\/overview$/)
  })

  test("notifications open an empty list", async ({ page }) => {
    await page.goto("/overview")
    await page.getByRole("button", { name: "Notifications" }).click()
    const popover = page.getByRole("dialog", { name: "Notifications" })
    await expect(popover.getByText("No notifications")).toBeVisible()
    await expect(popover.getByText("Updates on your orders and shipments show here")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(popover).toBeHidden()
  })

  test("the user menu shows who's signed in", async ({ page }) => {
    await page.goto("/overview")
    await page.getByRole("button", { name: /Casey Tester/ }).click()
    const menu = page.getByRole("menu")
    await expect(menu.getByText("Casey Tester")).toBeVisible()
    await expect(menu.getByText(e2eEmail)).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: "Theme" })).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
  })

  test("the theme choice lasts across a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" })
    await page.goto("/overview")
    const html = page.locator("html")
    const closeMenus = async () => {
      await expect(async () => {
        if (await page.getByRole("menu").count()) {
          await page.keyboard.press("Escape")
        }
        await expect(page.getByRole("menu")).toHaveCount(0, { timeout: 500 })
      }).toPass()
    }
    const openThemes = async () => {
      await page.getByRole("button", { name: /Casey Tester/ }).click()
      // By keyboard: pointer moves between the menu and its submenu can close and reopen it.
      await page.getByRole("menuitem", { name: "Theme" }).press("ArrowRight")
      await expect(page.getByRole("menuitemradio", { name: "System" })).toBeVisible()
    }
    const choose = async (theme: "Light" | "Dark" | "System") => {
      await openThemes()
      await page.getByRole("menuitemradio", { name: theme }).press("Enter")
      await closeMenus()
    }
    try {
      await choose("Dark")
      await expect(html).toHaveClass(/(^|\s)dark(\s|$)/)
      await page.reload()
      await expect(html).toHaveClass(/(^|\s)dark(\s|$)/)
      await openThemes()
      await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeChecked()
      await closeMenus()

      await choose("Light")
      await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/)
      // Light holds even when the computer prefers dark.
      await page.emulateMedia({ colorScheme: "dark" })
      await page.reload()
      await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/)
    } finally {
      // The choice lives in this browser's storage, which the next test starts from.
      await closeMenus()
      await choose("System")
    }
  })

  test("a phone opens the sidebar from its menu button", { tag: "@mobile" }, async ({ page, isMobile }) => {
    test.skip(!isMobile, "The sidebar stays open on a wide screen")
    await page.goto("/overview")
    await expect(sidebar(page)).toHaveCount(0)
    await page.getByRole("button", { name: "Toggle sidebar" }).click()
    const sheet = page.getByRole("dialog", { name: "Sidebar" })
    await expect(sheet.getByText("Buyer workspace")).toBeVisible()
    await sheet.getByRole("link", { name: "Purchase orders" }).click()
    await expect(page).toHaveURL(/\/orders$/)
    await expect(page.getByRole("heading", { level: 1, name: "Purchase orders" })).toBeVisible()
    // Following a link closes the sheet.
    await expect(sheet).toBeHidden()
  })
})
