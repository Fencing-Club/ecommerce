import { CircleAlert, Lock, Plus, Repeat } from "lucide-react"
import { expect, waitFor, within } from "storybook/test"
import { useTranslations } from "use-intl"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { DocumentList, EmptyState, formatDestination, PageHeader, Status, StatusBadge, WarningNote } from "./common"
import { TabLinks } from "./tab-links"

const meta = preview.meta({
  title: "Components/Display/Common",
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
    await expect(tone("Received")).toBe("neutral")
    await expect(tone("Needs attention")).toBe("destructive")
    await expect(tone("Partially fulfilled")).toBe("info")
    await expect(tone("Out of stock")).toBe("destructive")
    await expect(tone("Needs review")).toBe("neutral")
  }
})

// Each tone's pill as the kit draws it: its soft fill, with its dot and label in the tone's color.
export const TonesMatchTheKit = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge tone="info">In transit</StatusBadge>
      <StatusBadge tone="warning">To pack</StatusBadge>
      <StatusBadge tone="success">Ready for pickup</StatusBadge>
      <StatusBadge tone="neutral">Draft</StatusBadge>
      <StatusBadge tone="destructive">Out of stock</StatusBadge>
    </div>
  ),
  play: async ({ canvas }) => {
    const look = (text: string) => {
      const pill = canvas.getByText(text)
      return [getComputedStyle(pill).backgroundColor, getComputedStyle(pill).color]
    }
    await expect(look("In transit")).toEqual(["rgb(234, 242, 252)", "rgb(31, 99, 184)"])
    await expect(look("To pack")).toEqual(["rgb(255, 245, 220)", "rgb(122, 75, 0)"])
    await expect(look("Ready for pickup")).toEqual(["rgb(231, 244, 231)", "rgb(0, 99, 0)"])
    // Muted is oklch(0.97 0 0), the kit's #F5F5F5.
    await expect(look("Draft")).toEqual(["oklch(0.97 0 0)", "rgb(107, 107, 107)"])
    await expect(look("Out of stock")).toEqual(["rgb(253, 236, 236)", "rgb(220, 38, 38)"])
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

// A record's page: its parents on their own row above the title, with its status after the title. A parent the person
// can't open is plain text.
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
    await expect(breadcrumb.querySelectorAll("ol svg")).toHaveLength(1)
    await expect(breadcrumb.querySelector("ol li:last-child")?.lastChild?.nodeName).not.toBe("svg")
    const title = canvas.getByRole("heading", { level: 1, name: "PO-1045" })
    await expect(title).toBeVisible()
    await expect(title.getBoundingClientRect().top).toBeGreaterThanOrEqual(breadcrumb.getBoundingClientRect().bottom)
    await expect(canvas.getByText("With supplier")).toBeVisible()
  }
})

// The whole record header: breadcrumb, title, status, View only, the record's actions, its meta row and its tabs.
export const FullRecordHeader = meta.story({
  render: () => (
    <PageHeader
      title="PO-1045"
      parents={[{ label: "Purchase orders", href: "/orders" }]}
      badge={<Status status="accepted" />}
      viewOnly
      meta={[
        { label: "Supplier", value: "Lotus Manufacturing" },
        { label: "Forwarder", value: "Bayline Freight" },
        { label: "Destination", value: "Amazon FBA and AWD US" }
      ]}
      tabs={
        <TabLinks
          label="Purchase order"
          tabs={[
            { label: "Items", href: "/orders/po-1045", current: true },
            { label: "Shipments", href: "/orders/po-1045?tab=shipments", current: false, count: 2 },
            { label: "Documents", href: "/orders/po-1045?tab=documents", current: false, count: 5 },
            { label: "Activity", href: "/orders/po-1045?tab=activity", current: false, count: 12 }
          ]}
        />
      }
    >
      <Button variant="outline">Download PDF</Button>
    </PageHeader>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Accepted")).toBeVisible()
    await expect(canvas.getByText("View only")).toBeVisible()
    // Each fact in the meta row is a label and its value.
    await expect(canvas.getAllByRole("definition")).toHaveLength(3)
    await expect(canvas.getByText("Bayline Freight")).toBeVisible()
    await expect(canvas.getByText("Forwarder")).toBeVisible()
    await expect(canvas.getByRole("navigation", { name: "Purchase order" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Download PDF" })).toBeVisible()
  }
})

// On a phone the title is a size smaller, and the actions wrap under it.
export const HeaderOnAPhone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  render: () => (
    <PageHeader title="Purchase orders">
      <Button variant="outline">Import</Button>
      <Button>Create purchase order</Button>
    </PageHeader>
  ),
  play: async ({ canvas }) => {
    const title = canvas.getByRole("heading", { level: 1, name: "Purchase orders" })
    await expect(getComputedStyle(title).fontSize).toBe("22px")
    const create = canvas.getByRole("button", { name: "Create purchase order" }).getBoundingClientRect()
    await expect(create.top).toBeGreaterThanOrEqual(title.getBoundingClientRect().bottom)
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
      icon={<Spinner aria-label="Syncing" />}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Syncing")).toBeVisible()
    await expect(canvas.queryByRole("button")).toBeNull()
  }
})

// A page outside the shell, whose empty state is all there is: its title is the page's heading.
export const EmptyAsPageHeading = meta.story({
  render: () => (
    <EmptyState
      titleAs="h1"
      title="This page didn't load"
      description="Nothing was changed"
      icon={<CircleAlert aria-hidden />}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "This page didn't load" })).toBeVisible()
  }
})

// Under a page header that already says what happened, the empty state only says what to do.
export const EmptyWithoutTitle = meta.story({
  render: () => <EmptyState description="Ask an admin for access" icon={<Lock aria-hidden />} />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Ask an admin for access")).toBeVisible()
    await expect(canvasElement.querySelector("[data-slot=empty-title]")).toBeNull()
    await expect(canvas.queryByRole("heading")).toBeNull()
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
    await expect(canvas.getByRole("link", { name: "Download Purchase order PO-1045.pdf" })).toHaveAttribute(
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

export const CombinedLabels = meta.story({
  render: () => (
    <DocumentList
      documents={[
        { id: "a1", name: "A1.pdf", kind: "carton_label", cartonId: "A1", shipmentId: "shipment-1" },
        { id: "a2", name: "A2.pdf", kind: "carton_label", cartonId: "A2", shipmentId: "shipment-1" },
        { id: "carrier1", name: "carrier1.pdf", kind: "shipping_label", cartonId: "A1", shipmentId: "shipment-1" },
        { id: "carrier2", name: "carrier2.pdf", kind: "shipping_label", cartonId: "A2", shipmentId: "shipment-1" }
      ]}
    />
  ),
  play: async ({ canvas }) => {
    const links = canvas.getAllByRole("link")
    await expect(links).toHaveLength(2)
    await expect(links[0]).toHaveAttribute("href", "/api/documents/a1?bundle=true")
    await expect(links[1]).toHaveAttribute("href", "/api/documents/carrier1?bundle=true")
    await expect(canvas.queryByText("A1.pdf")).not.toBeInTheDocument()
  }
})

// Where a text's last character ends on screen, rather than its element's box.
function textRight(element: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(element)
  return range.getBoundingClientRect().right
}

// File names read left to right in Urdu too: a purchase order's 1043.pdf, and an upload that goes by its name.
export const DocumentsInUrdu = meta.story({
  globals: { locale: "ur" },
  render: () => (
    <div className="max-w-md">
      <DocumentList
        documents={[
          { id: "doc-po", name: "1043.pdf", kind: "purchase_order" },
          { id: "doc-upload", name: "2291 invoice.pdf" }
        ]}
      />
    </div>
  ),
  play: async ({ canvas }) => {
    await waitFor(() => expect(document.documentElement).toHaveAttribute("dir", "rtl"))
    for (const file of ["1043.pdf", "2291 invoice.pdf"]) {
      const name = canvas.getByText(file)
      await expect(name).toHaveAttribute("dir", "ltr")
      // Its line still starts on the right, beside the icon.
      await expect(textRight(name)).toBeCloseTo(name.parentElement!.getBoundingClientRect().right, 0)
    }
  }
})
