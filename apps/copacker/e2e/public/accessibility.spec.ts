import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "../fixtures"

// The signed-out pages, checked for the accessibility problems that block or seriously hinder someone. Axe can't judge
// everything, so this is a floor, not a pass.
const pages = [
  { name: "landing", path: "/" },
  { name: "contact", path: "/contact" },
  { name: "privacy", path: "/privacy" },
  { name: "terms", path: "/terms" },
  { name: "sign in", path: "/login" },
  { name: "sign up", path: "/signup" },
  { name: "forgot password", path: "/forgot-password" },
  { name: "reset password without a token", path: "/reset-password" },
  { name: "unsubscribe with a bad link", path: "/unsubscribe" },
  { name: "not found", path: "/no-such-page-here" }
]

for (const { name, path } of pages) {
  test(`${name} has no serious accessibility violations`, { tag: "@smoke" }, async ({ page }) => {
    // Without motion, so nothing is caught halfway through fading in.
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(path)
    await expect(page.getByRole("main").first()).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
    const serious = results.violations
      .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
      .map((violation) => ({
        rule: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => `${node.target.join(" ")} ${node.failureSummary}`).slice(0, 8)
      }))
    expect(serious).toEqual([])
  })
}
