import { expect, test } from "../fixtures"

const documents = [
  { path: "/privacy", title: "Privacy policy", browserTitle: "Privacy policy | Copacker" },
  { path: "/terms", title: "Terms of service", browserTitle: "Terms of service | Copacker" }
]

for (const document of documents) {
  test.describe(document.title, () => {
    test("the contents jump to each section", { tag: "@smoke" }, async ({ page }) => {
      await page.goto(document.path)
      await expect(page).toHaveTitle(document.browserTitle)
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(document.title)
      await expect(page.getByText(/^Last updated /)).toBeVisible()

      const contents = page.getByRole("navigation", { name: "Contents" })
      const links = contents.getByRole("link")
      const titles = await links.allTextContents()
      expect(titles.length).toBeGreaterThan(3)
      // Every entry names a section on the page.
      await expect(page.getByRole("heading", { level: 2 })).toHaveText(titles)

      for (const title of [titles[1]!, titles.at(-1)!, titles[0]!]) {
        await contents.getByRole("link", { name: title, exact: true }).click()
        const heading = page.getByRole("heading", { level: 2, name: title, exact: true })
        await expect(heading).toBeInViewport()
        const id = await page.getByRole("region", { name: title, exact: true }).getAttribute("id")
        await expect(page).toHaveURL(new RegExp(`#${id}$`))
      }
    })

    test("the contents fold away on a phone", { tag: ["@smoke", "@mobile"] }, async ({ page, isMobile }) => {
      test.skip(!isMobile, "The contents stay beside the text on a wide screen")
      await page.goto(document.path)
      await expect(page.getByRole("navigation", { name: "Contents" })).toBeHidden()
      await page.getByText("Contents", { exact: true }).filter({ visible: true }).click()
      const contents = page.getByRole("navigation", { name: "Contents" })
      await expect(contents).toBeVisible()
      const title = (await contents.getByRole("link").nth(1).textContent()) ?? ""
      await contents.getByRole("link", { name: title, exact: true }).click()
      await expect(page.getByRole("heading", { level: 2, name: title, exact: true })).toBeInViewport()
    })
  })
}
