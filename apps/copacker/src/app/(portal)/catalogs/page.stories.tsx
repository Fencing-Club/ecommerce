import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { can, type Permissions } from "@/lib/access"
import { catalogRows, catalogViewer } from "@/stories/fixtures/supplier"
import { pageStory } from "@/stories/server"
import { owner } from "@/stories/workspace"
import PageView from "./page"

function CatalogsPage({ catalogs, permissions }: { catalogs: typeof catalogRows; permissions: Permissions }) {
  return <PageView page={{ catalogs: catalogs, editable: can(permissions, "catalogs", "edit") }} />
}

const meta = preview.meta({
  title: "Pages/Supplier/Catalogs",
  ...pageStory("/catalogs", CatalogsPage, "supplier"),
  args: { catalogs: catalogRows, permissions: owner }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Catalogs" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Create catalog" })).toHaveAttribute("href", "/catalogs/new")
    await expect(canvas.getByRole("link", { name: "Wholesale 2026" })).toBeVisible()
    await expect(canvas.getByText("Harbor Goods and 1 more")).toBeVisible()
    // The supplier's sidebar, with its workspace.
    await expect(canvas.getAllByText("Lotus Manufacturing")[0]).toBeVisible()
  }
})

// Without catalogs the empty state offers to create one, so the header doesn't.
export const Empty = meta.story({
  args: { catalogs: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No catalogs yet")).toBeVisible()
    await expect(canvas.getAllByRole("button", { name: "Create catalog" })).toHaveLength(1)
  }
})

// A member who views catalogs can't create one.
export const Viewer = meta.story({
  args: { permissions: catalogViewer },
  parameters: { permissions: catalogViewer },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Retail partners" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Create catalog" })).toBeNull()
  }
})
