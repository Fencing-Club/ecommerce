import { expect, test } from "../fixtures"

test.describe("site routes", () => {
  test("an unknown address shows the not-found page", { tag: ["@smoke", "@mobile"] }, async ({ page }) => {
    const response = await page.goto("/no-such-page-here")
    expect(response?.status()).toBe(404)
    await expect(page).toHaveTitle(/Page not found/)
    await expect(page.getByText("Page not found", { exact: true })).toBeVisible()
    await expect(page.getByText("Check the address and try again")).toBeVisible()
    await page.getByRole("button", { name: "Go to Copacker" }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Restocking, handled.")
  })

  test("an unsubscribe link that isn't Copacker's says so", { tag: "@smoke" }, async ({ page }) => {
    for (const query of ["?email=someone%40example.net&token=not-a-signature", "", "?email=someone%40example.net"]) {
      await page.goto(`/unsubscribe${query}`)
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link doesn’t work.")
      await expect(page.getByText("Open the unsubscribe link in your email again.")).toBeVisible()
      await expect(page.getByRole("button", { name: "Unsubscribe" })).toHaveCount(0)
    }
    await page.getByRole("link", { name: "Back to Copacker" }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test("robots.txt closes the app and points at the sitemap", { tag: "@smoke" }, async ({ request }) => {
    const response = await request.get("/robots.txt")
    expect(response.ok()).toBe(true)
    const text = await response.text()
    expect(text).toMatch(/User-Agent: \*/i)
    if (response.headers()["x-robots-tag"]?.includes("noindex")) {
      expect(text).toContain("Disallow: /\n")
      expect(text).not.toContain("Allow: /")
      return
    }
    expect(text).toContain("Allow: /")
    for (const closed of ["/api/", "/overview", "/orders", "/settings", "/onboarding", "/invite", "/unsubscribe"]) {
      expect(text).toContain(`Disallow: ${closed}\n`)
    }
    const sitemap = /^Sitemap: (.+)$/m.exec(text)?.[1]
    expect(sitemap).toBeDefined()
    expect(new URL(sitemap!).pathname).toBe("/sitemap.xml")
  })

  test("the sitemap lists the marketing pages", { tag: "@smoke" }, async ({ request }) => {
    const response = await request.get("/sitemap.xml")
    expect(response.ok()).toBe(true)
    expect(response.headers()["content-type"]).toContain("xml")
    const locations = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      ([, url]) => new URL(url!).pathname
    )
    expect(locations).toEqual(["/", "/contact", "/privacy", "/terms"])
  })

  test("the health check answers", { tag: "@smoke" }, async ({ request }) => {
    const response = await request.get("/api/health")
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("application/json")
    expect(await response.json()).toMatchObject({ status: "ok", service: "copacker" })
  })
})
