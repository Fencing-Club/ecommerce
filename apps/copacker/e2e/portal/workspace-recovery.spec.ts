import { expect, signIn, switchWorkspace, test } from "../fixtures"

// A fresh session keeps the role fixtures' saved workspace selections intact.
test("an unavailable saved workspace offers a choice and opens the selected workspace safely", async ({ page }) => {
  await signIn(page)
  await switchWorkspace(page, "buyer")
  const current = (await page.context().cookies()).find((cookie) => cookie.name === "copacker-workspace")
  expect(current).toBeDefined()
  await page.context().addCookies([{ ...current!, value: "00000000-0000-4000-8000-000000000000" }])
  await page.goto("/orders?status=draft")
  await expect(page).toHaveURL(/\/workspaces\?unavailable=1$/)
  await expect(page.getByRole("heading", { name: "Choose a workspace" })).toBeVisible()
  await switchWorkspace(page, "buyer")
  await expect(page).toHaveURL(/\/overview$/)
  await expect(page.getByRole("button", { name: "E2E Buyer, switch workspace" })).toBeVisible()
  expect((await page.context().cookies()).find((cookie) => cookie.name === "copacker-workspace")?.value).toBe(
    current!.value
  )
})
