import { expect, signIn, switchWorkspace, test, workspaces } from "../fixtures"

// Its own browser, signed in afresh: switching workspaces on a role page would carry into the next test.
test("the workspace switcher moves between buyer, supplier and forwarder", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: "en-US" })
  try {
    const page = await context.newPage()
    await signIn(page)
    const switcher = (name: string) => page.getByRole("button", { name: new RegExp(`${name}.* workspace`) })
    const links = page.locator("[data-sidebar=content]").getByRole("link")
    const switchTo = async (role: "buyer" | "supplier" | "forwarder") => {
      await switchWorkspace(page, role)
      await expect(page).toHaveURL(role === "buyer" ? /\/overview$/ : /\/orders$/)
    }

    await switchTo("buyer")
    await expect(page).toHaveURL(/\/overview$/)
    await expect(switcher(workspaces.buyer)).toContainText("Buyer workspace")
    await expect(links).toContainText(["Overview", "Restock", "Partners"])

    const menu = page.getByRole("menu")
    await expect(async () => {
      if (!(await menu.count())) {
        await switcher(workspaces.buyer).click({ timeout: 3000 })
      }
      await expect(menu.getByText("Workspaces")).toBeVisible({ timeout: 3000 })
      for (const name of Object.values(workspaces)) {
        await expect(menu.getByRole("menuitem", { name })).toBeVisible({ timeout: 1000 })
      }
    }).toPass()
    await page.keyboard.press("Escape")

    await switchTo("supplier")
    await expect(switcher(workspaces.supplier)).toContainText("Supplier workspace")
    await expect(links).toContainText(["Overview", "Customers", "Inventory", "Catalogs"])

    await switchTo("forwarder")
    await expect(page).toHaveURL(/\/orders$/)
    await expect(switcher(workspaces.forwarder)).toContainText("Forwarder workspace")
    await expect(links).toHaveText(["Purchase orders", "Settings"])

    // "New workspace" opens getting started for another company, and Cancel comes back.
    await expect(async () => {
      await switcher(workspaces.forwarder).click({ timeout: 3000 })
      await page.getByRole("menuitem", { name: "New workspace" }).click({ timeout: 3000 })
    }).toPass()
    await expect(page).toHaveURL(/\/workspaces\/new$/)
    await expect(page.getByRole("heading", { name: "What does your company do?" })).toBeVisible()
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page).toHaveURL(/\/orders$/)
    await expect(switcher(workspaces.forwarder)).toContainText("Forwarder workspace")
  } finally {
    await context.close()
  }
})
