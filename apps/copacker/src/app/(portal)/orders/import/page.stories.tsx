import { http, HttpResponse } from "msw"
import { getTranslations } from "next-intl/server"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { PageHeader } from "@/components/common"
import { ImportIntake } from "@/components/import-intake"
import { importList } from "@/stories/fixtures/purchase-orders"
import { pageStory } from "@/stories/server"

// The import page (page.tsx), which only buyers who edit purchase orders open.
async function ImportOrder() {
  const t = await getTranslations("orders")
  return (
    <>
      <PageHeader parents={[{ label: t("index.title"), href: "/orders" }]} title={t("import.title")} />
      <ImportIntake />
    </>
  )
}

const meta = preview.meta({
  title: "Pages/Buyer/Purchase orders/Import",
  ...pageStory("/orders/import", ImportOrder),
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/imports", () => HttpResponse.json({ items: importList })))
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Import purchase order" })).toBeVisible()
    const breadcrumb = within(canvas.getByRole("navigation", { name: "Breadcrumb" }))
    await expect(breadcrumb.getByRole("link", { name: "Purchase orders" })).toHaveAttribute("href", "/orders")
    await expect(canvas.getByRole("button", { name: "Import" })).toBeDisabled()
    await expect(await canvas.findByText("lotus-po-118.pdf")).toBeVisible()
  }
})

export const NoImports = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/imports", () => HttpResponse.json({ items: [] })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No imports yet")).toBeVisible()
  }
})
