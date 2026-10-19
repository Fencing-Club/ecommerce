import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { pageStory } from "@/stories/server"
import { member } from "@/stories/workspace"
import PortalForbidden from "./forbidden"

// What a member sees on a page they weren't given, such as Partners from a colleague's link.
const meta = preview.meta({
  title: "Pages/Errors/No access",
  parameters: { permissions: member }
})

export const Default = meta.story({
  ...pageStory("/partners", () => <PortalForbidden />),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "No access" })).toBeVisible()
    await expect(canvas.getByText("Ask an admin for access")).toBeVisible()
    // The sidebar lists the pages they can open.
    await expect(canvas.queryByRole("link", { name: "Partners" })).toBeNull()
    await expect(canvas.getByRole("link", { name: "Purchase orders" })).toBeVisible()
  }
})

export const Supplier = meta.story({
  ...pageStory("/catalogs", () => <PortalForbidden />, "supplier"),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "No access" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "Catalogs" })).toBeNull()
    await expect(canvas.getByRole("link", { name: "Inventory" })).toBeVisible()
  }
})
