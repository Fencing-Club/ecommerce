import { Plus, Repeat } from "lucide-react"
import { useTranslations } from "next-intl"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { DocumentList, EmptyState, formatDestination, PageHeader, Status, StatusBadge, WarningNote } from "./common"

const meta = preview.meta({
  component: Status,
  args: { status: "submitted" }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const badge = canvas.getByText("With supplier")
    await expect(badge).toHaveAttribute("data-tone", "info")
  }
})

// Statuses as the app stores them, in a store's words, and one the app doesn't know, which reads as words.
export const Statuses = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-2">
      {["draft", "approval", "received", "needs_attention", "Partially fulfilled", "OUT-OF-STOCK", "needs_review"].map(
        (status) => (
          <Status key={status} status={status} />
        )
      )}
    </div>
  ),
  play: async ({ canvas }) => {
    const tone = (text: string) => canvas.getByText(text).getAttribute("data-tone")
    await expect(tone("Draft")).toBe("neutral")
    await expect(tone("Approval needed")).toBe("warning")
    await expect(tone("Received")).toBe("success")
    await expect(tone("Needs attention")).toBe("destructive")
    await expect(tone("Partially fulfilled")).toBe("info")
    await expect(tone("Out of stock")).toBe("destructive")
    await expect(tone("Needs review")).toBe("neutral")
  }
})

export const BadgeWithIcon = meta.story({
  render: () => (
    <StatusBadge tone="warning" icon={<Repeat aria-label="Replacement" />}>
      Replacement
    </StatusBadge>
  ),
  play: async ({ canvas }) => {
    const badge = canvas.getByText("Replacement", { selector: "[data-slot=status]" })
    await expect(badge).toHaveAttribute("data-tone", "warning")
    await expect(within(badge).getByLabelText("Replacement")).toBeInTheDocument()
  }
})

export const Header = meta.story({
  render: () => (
    <PageHeader title="Purchase orders" description="Every purchase order with your suppliers">
      <Button>
        <Plus data-icon="inline-start" />
        Create purchase order
      </Button>
    </PageHeader>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Purchase orders" })).toBeVisible()
    await expect(canvas.getByText("Every purchase order with your suppliers")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Create purchase order" })).toBeVisible()
    await expect(canvas.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull()
  }
})

// Titles sit at the same height with or without actions beside them, even a taller control such as a large button.
export const TitlesLineUp = meta.story({
  render: () => (
    <div className="grid grid-cols-2 items-start gap-8">
      <PageHeader title="Products" />
      <PageHeader title="Overview">
        <Button size="lg">Last 30 days</Button>
      </PageHeader>
    </div>
  ),
  play: async ({ canvas }) => {
    const products = canvas.getByRole("heading", { level: 1, name: "Products" }).getBoundingClientRect()
    const overview = canvas.getByRole("heading", { level: 1, name: "Overview" }).getBoundingClientRect()
    await expect(overview.top).toBe(products.top)
  }
})

// A record's page: its parents lead the title, with its status after it. A parent the person can't open is plain text.
export const RecordHeader = meta.story({
  render: () => (
    <PageHeader
      title="PO-1045"
      parents={[{ label: "Purchase orders", href: "/orders" }, { label: "Lotus Manufacturing" }]}
      badge={<Status status="submitted" />}
    />
  ),
  play: async ({ canvas }) => {
    const breadcrumb = canvas.getByRole("navigation", { name: "Breadcrumb" })
    await expect(within(breadcrumb).getByRole("link", { name: "Purchase orders" })).toHaveAttribute("href", "/orders")
    await expect(within(breadcrumb).queryByRole("link", { name: "Lotus Manufacturing" })).toBeNull()
    await expect(within(breadcrumb).getByText("Lotus Manufacturing")).toBeVisible()
    await expect(canvas.getByRole("heading", { level: 1, name: "PO-1045" })).toBeVisible()
    await expect(canvas.getByText("With supplier")).toBeVisible()
  }
})

export const Empty = meta.story({
  render: () => (
    <EmptyState title="No shipments yet" description="Shipments show here once a supplier packs a purchase order">
      <Button>Create purchase order</Button>
    </EmptyState>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("No shipments yet")).toBeVisible()
    await expect(canvas.getByText("Shipments show here once a supplier packs a purchase order")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Create purchase order" })).toBeVisible()
    // The icon sits on a tile, as every empty state's does.
    await expect(canvasElement.querySelector("[data-slot=empty-icon]")).toHaveAttribute("data-variant", "icon")
  }
})

export const EmptyWhileSyncing = meta.story({
  render: () => (
    <EmptyState
      title="Copying your products"
      description="Products show here once the first sync finishes"
      media={<Spinner aria-label="Syncing" />}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Syncing")).toBeVisible()
    await expect(canvas.queryByRole("button")).toBeNull()
  }
})

export const Warning = meta.story({
  render: () => <WarningNote>No barcode for this variation</WarningNote>,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No barcode for this variation")).toBeVisible()
  }
})

// Where a purchase order goes, named in the person's language, or as stored when it isn't a known destination.
function Destinations() {
  const t = useTranslations("common")
  return (
    <ul>
      <li>{formatDestination("amazon", t)}</li>
      <li>{formatDestination("warehouse", t)}</li>
      <li>{formatDestination("warehouse")}</li>
      <li>{formatDestination("Bayline Freight, Oakland")}</li>
    </ul>
  )
}

export const DestinationNames = meta.story({
  render: () => <Destinations />,
  play: async ({ canvas }) => {
    const items = canvas.getAllByRole("listitem").map((item) => item.textContent)
    await expect(items).toEqual(["Amazon", "your location", "your location", "Bayline Freight, Oakland"])
  }
})

export const Documents = meta.story({
  render: () => (
    <div className="max-w-md">
      <DocumentList
        documents={[
          { id: "doc-po", name: "PO-1045.pdf", kind: "purchase_order" },
          { id: "doc-invoice", name: "lotus-invoice-8812.pdf", kind: "invoice" },
          { id: "doc-carton", name: "carton-labels.pdf", kind: "carton_label", cartonId: "C-02" },
          { id: "doc-other", name: "inspection-photos.pdf" }
        ]}
      />
    </div>
  ),
  play: async ({ canvas }) => {
    const links = canvas.getAllByRole("link")
    await expect(links).toHaveLength(4)
    await expect(canvas.getByRole("link", { name: /Download Purchase order/ })).toHaveAttribute(
      "href",
      "/api/documents/doc-po"
    )
    await expect(canvas.getByRole("link", { name: /Download Commercial invoice/ })).toHaveTextContent(
      "lotus-invoice-8812.pdf"
    )
    await expect(canvas.getByRole("link", { name: /Download Carton label C-02/ })).toBeVisible()
    // A document without a kind goes by its file name.
    await expect(canvas.getByRole("link", { name: /Download inspection-photos.pdf/ })).toHaveAttribute(
      "href",
      "/api/documents/doc-other"
    )
  }
})
