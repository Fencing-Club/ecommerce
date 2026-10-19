import { http, HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import type { CatalogEditorData } from "@/server/catalogs"
import { newCatalog } from "@/stories/fixtures/supplier"
import { pageStory } from "@/stories/server"
import PageView from "./page"

// The New catalog page (page.tsx): the catalog form with every active product and the customers to assign.
async function NewCatalogPage({ data }: { data: CatalogEditorData }) {
  return <PageView page={{ data, readOnly: false }} />
}

const saved = fn()

const meta = preview.meta({
  title: "Pages/Catalogs/New",
  ...pageStory("/catalogs/new", NewCatalogPage, "supplier"),
  args: { data: newCatalog },
  beforeEach: ({ msw }) => {
    saved.mockClear()
    msw.use(
      http.post("/api/catalogs", async ({ request }) => {
        saved(await request.json())
        return HttpResponse.json({ id: "6a2d4f80-4b3e-4f5a-8c6d-000000000010" })
      })
    )
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "New catalog" })).toBeVisible()
    await expect(
      within(canvas.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Catalogs" })
    ).toHaveAttribute("href", "/catalogs")
    await expect(canvas.getByRole("tab", { name: /Included\s*3/ })).toBeVisible()
    await userEvent.type(canvas.getByRole("textbox", { name: /Title/ }), "Trade show")
    const bar = within(screen.getByRole("region", { name: "Unsaved changes" }))
    await userEvent.click(bar.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ title: "Trade show" })))
    await waitFor(() =>
      expect(getStoryRouter().navigate).toHaveBeenCalledWith({
        href: "/catalogs/6a2d4f80-4b3e-4f5a-8c6d-000000000010",
        replace: true
      })
    )
  }
})

// A supplier without products yet.
export const NoProducts = meta.story({
  args: { data: { ...newCatalog, products: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No products yet")).toBeVisible()
    await expect(canvas.getByText("Add products before building a catalog.")).toBeVisible()
  }
})
