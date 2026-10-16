import { http, HttpResponse } from "msw"
import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { can, type Permissions } from "@/lib/access"
import type { CatalogEditorData } from "@/server/catalogs"
import { catalogIds, catalogViewer, wholesaleCatalog } from "@/stories/fixtures/supplier"
import { pageStory } from "@/stories/server"
import { owner } from "@/stories/workspace"
import PageView from "./page"

// A catalog's page (page.tsx): its form, read-only for someone who can't edit catalogs.
async function CatalogPage({ data, permissions }: { data: CatalogEditorData; permissions: Permissions }) {
  // A new revision remounts the form with what was saved.
  return (
    <PageView key={data.catalog?.revision} page={{ data: data, readOnly: !can(permissions, "catalogs", "edit") }} />
  )
}

const saved = fn()

const meta = preview.meta({
  title: "Pages/Supplier/Catalogs/Detail",
  ...pageStory(`/catalogs/${catalogIds.wholesale}`, CatalogPage, "supplier"),
  args: { data: wholesaleCatalog, permissions: owner },
  beforeEach: ({ msw }) => {
    saved.mockClear()
    msw.use(
      http.post("/api/catalogs", async ({ request }) => {
        saved(await request.json())
        return HttpResponse.json({ id: catalogIds.wholesale })
      })
    )
  }
})

function CatalogRevision() {
  const [data, setData] = useState(wholesaleCatalog)
  return (
    <>
      <button
        onClick={() =>
          setData({
            ...wholesaleCatalog,
            catalog: wholesaleCatalog.catalog && {
              ...wholesaleCatalog.catalog,
              revision: wholesaleCatalog.catalog.revision + 1,
              title: "Updated wholesale catalog"
            }
          })
        }
      >
        Load saved revision
      </button>
      <PageView page={{ data, readOnly: false }} />
    </>
  )
}

export const SavedRevision = meta.story({
  ...pageStory(`/catalogs/${catalogIds.wholesale}`, () => <CatalogRevision />, "supplier"),
  play: async ({ canvas }) => {
    const title = canvas.getByRole("textbox", { name: /Title/ })
    await userEvent.clear(title)
    await userEvent.type(title, "Unsaved title")
    await userEvent.click(canvas.getByRole("button", { name: "Load saved revision" }))
    await expect(canvas.getByRole("textbox", { name: /Title/ })).toHaveValue("Updated wholesale catalog")
    await expect(canvas.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Wholesale 2026" })).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: /Title/ })).toBeEnabled()
    await userEvent.click(canvas.getByRole("switch", { name: "Automatically include new products" }))
    const bar = within(screen.getByRole("region", { name: "Unsaved changes" }))
    await userEvent.click(bar.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith(
        expect.objectContaining({ id: catalogIds.wholesale, revision: 3, includeNewProducts: false })
      )
    )
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

// A member who views catalogs sees this one as it's saved.
export const ReadOnly = meta.story({
  args: { permissions: catalogViewer },
  parameters: { permissions: catalogViewer },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: /Title/ })).toBeDisabled()
    await expect(canvas.queryByRole("checkbox")).toBeNull()
    await expect(canvas.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    await expect(await screen.findByRole("menuitem", { name: "Export to Excel" })).toBeInTheDocument()
    await expect(screen.queryByRole("menuitem", { name: "Delete catalog" })).toBeNull()
  }
})
