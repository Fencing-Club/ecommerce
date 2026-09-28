import { Search } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { expect, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { EmptyState, PageHeader } from "@/components/common"
import { AddPartner, ForwarderRow, SupplierRow } from "@/components/partner-actions"
import type { PartnerAddress } from "@/components/partner-address"
import { TabLinks } from "@/components/tab-links"
import { Card } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { can, type Permissions } from "@/lib/access"
import type { PartnerForwarder, PartnerSupplier } from "@/server/partners"
import { restockSettings } from "@/server/restock-report"
import { forwarderRecordId, partnerAddresses, supplierRecordId } from "@/stories/fixtures/logistics"
import { pageStory } from "@/stories/server"
import { owner } from "@/stories/workspace"

// What the page reads of each partner from listPartners.
type Supplier = Pick<
  PartnerSupplier,
  "id" | "name" | "email" | "shopifySupplierName" | "leadTimeDays" | "contact" | "supplierOrgId" | "invitationHash"
> & { expired: boolean; addresses: PartnerAddress[] }
type Forwarder = Pick<PartnerForwarder, "id" | "name" | "email" | "forwarderOrgId" | "invitationHash"> & {
  expired: boolean
  addresses: PartnerAddress[]
}
type Partner =
  | { type: "supplier"; id: string; name: string; supplier: Supplier }
  | { type: "forwarder"; id: string; name: string; forwarder: Forwarder }

type Args = {
  permissions: Permissions
  // The ?type= and ?q= in the URL.
  type?: string
  q?: string
  partners: Partner[]
  // The workspace's own restock lead time, when it set one.
  restockLeadTimeDays: number | null
}

// As page.tsx shapes each row.
const tabs = [{ key: "all" }, { key: "supplier" }, { key: "forwarder" }] as const

function addressDetails(contact: PartnerAddress) {
  return { id: contact.id, name: contact.name, address: contact.address }
}

function supplierDetails(row: Supplier) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    shopifySupplierName: row.shopifySupplierName,
    leadTimeDays: row.leadTimeDays,
    contact: row.contact,
    joined: row.supplierOrgId !== null,
    invited: Boolean(row.invitationHash),
    expired: row.expired,
    addresses: row.addresses.map(addressDetails)
  }
}

function forwarderDetails(row: Forwarder) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    joined: row.forwarderOrgId !== null,
    invited: Boolean(row.invitationHash),
    expired: row.expired,
    addresses: row.addresses.map(addressDetails)
  }
}

function tabHref(tab: string, q: string) {
  const params = new URLSearchParams({ ...(tab !== "all" && { type: tab }), ...(q && { q }) })
  return params.size ? `/partners?${params}` : "/partners"
}

// The Partners page (page.tsx) with the partners the database would return.
async function PartnersPage({ permissions, type, q: query, partners, restockLeadTimeDays }: Args) {
  const t = await getTranslations("partners.page")
  const editable = can(permissions, "partners", "edit")
  const tab = tabs.find((candidate) => candidate.key === type)?.key ?? "all"
  const q = (query ?? "").trim().slice(0, 200)
  const needle = q.toLowerCase()
  const shown = partners.filter(
    (row) =>
      (tab === "all" || row.type === tab) &&
      (!needle ||
        row.name.toLowerCase().includes(needle) ||
        (row.type === "supplier" && (row.supplier.shopifySupplierName ?? "").toLowerCase().includes(needle)))
  )
  const defaultLeadTimeDays = restockSettings({ restockLeadTimeDays }).leadTimeDays
  let emptyHint = tab === "forwarder" ? t("hints.forwarder") : t("hints.supplier")
  if (q) {
    emptyHint = t("hints.search")
  }
  const showType = tab === "all"

  return (
    <>
      <PageHeader title={t("title")}>{editable && <AddPartner />}</PageHeader>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-2">
          <TabLinks
            label={t("tabsLabel")}
            tabs={tabs.map((candidate) => ({
              label: t(`tabs.${candidate.key}`),
              href: tabHref(candidate.key, q),
              current: candidate.key === tab
            }))}
          />
          <form action="/partners" className="ms-auto w-full sm:w-64">
            {tab !== "all" && <input type="hidden" name="type" value={tab} />}
            <InputGroup className="h-8">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                key={q}
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("search")}
                aria-label={t("search")}
              />
            </InputGroup>
          </form>
        </div>
        {shown.length ? (
          <div className="@container">
            <Table framed={false}>
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-4">{t("columns.name")}</TableHead>
                  {showType && <TableHead className="hidden @2xl:table-cell">{t("columns.type")}</TableHead>}
                  <TableHead>{t("columns.status")}</TableHead>
                  <TableHead className="hidden @2xl:table-cell">{t("columns.details")}</TableHead>
                  <TableHead className="w-12 pe-4">
                    <span className="sr-only">{t("columns.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) =>
                  row.type === "supplier" ? (
                    <SupplierRow
                      key={`s-${row.id}`}
                      supplier={supplierDetails(row.supplier)}
                      editable={editable}
                      showType={showType}
                      defaultLeadTimeDays={defaultLeadTimeDays}
                    />
                  ) : (
                    <ForwarderRow
                      key={`f-${row.id}`}
                      forwarder={forwarderDetails(row.forwarder)}
                      editable={editable}
                      showType={showType}
                    />
                  )
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState title={q ? t("empty.noMatch", { query: q }) : t(`empty.${tab}`)} description={emptyHint} />
        )}
      </Card>
    </>
  )
}

const noContact = { website: null, contactName: null, contactEmail: null, phoneNumber: null }

function supplier(id: string, name: string, changes: Partial<Supplier> = {}): Partner {
  const row: Supplier = {
    id,
    name,
    email: null,
    shopifySupplierName: null,
    leadTimeDays: null,
    contact: noContact,
    supplierOrgId: null,
    invitationHash: null,
    expired: false,
    addresses: [],
    ...changes
  }
  return { type: "supplier", id, name, supplier: row }
}

function forwarder(id: string, name: string, changes: Partial<Forwarder> = {}): Partner {
  const row: Forwarder = {
    id,
    name,
    email: null,
    forwarderOrgId: null,
    invitationHash: null,
    expired: false,
    addresses: [],
    ...changes
  }
  return { type: "forwarder", id, name, forwarder: row }
}

// Everyone Harbor Goods works with, by name, as listPartners sorts them.
const partners: Partner[] = [
  forwarder(forwarderRecordId, "Bayline Freight", {
    email: "ops@bayline.example.com",
    invitationHash: "hash_bayline",
    addresses: [partnerAddresses.forwarderWarehouse]
  }),
  supplier(supplierRecordId, "Lotus Manufacturing", {
    shopifySupplierName: "LOTUS MANUFACTURING CO., LTD",
    supplierOrgId: "org_supplier",
    email: "mei@lotus.example.com",
    leadTimeDays: 45,
    contact: {
      website: "https://lotus.example.com",
      contactName: "Mei Chen",
      contactEmail: "mei@lotus.example.com",
      phoneNumber: null
    },
    addresses: [partnerAddresses.factory]
  }),
  supplier("9a7e3f1c-2b4d-4e6f-8a1b-2c3d4e5f6a03", "Northwind Textiles", {
    email: "sales@northwind.example.com",
    invitationHash: "hash_northwind",
    expired: true
  }),
  forwarder("9a7e3f1c-2b4d-4e6f-8a1b-2c3d4e5f6a04", "Pacific Consolidators"),
  supplier("9a7e3f1c-2b4d-4e6f-8a1b-2c3d4e5f6a05", "Sunrise Ceramics")
]

// A member who opens Partners without changing it.
const viewer: Permissions = { role: "member", access: { partners: "view" } }

const meta = preview.meta({
  title: "Pages/Partners",
  ...pageStory("/partners", PartnersPage),
  args: { permissions: owner, partners, restockLeadTimeDays: null } satisfies Args
})

export const All = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Partners" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Add partner" })).toBeVisible()
    const tabList = canvas.getByRole("navigation", { name: "Partner types" })
    await expect(within(tabList).getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page")
    await expect(within(tabList).getByRole("link", { name: "Forwarders" })).toHaveAttribute(
      "href",
      "/partners?type=forwarder"
    )
    const rows = canvas.getAllByRole("row").slice(1)
    await expect(rows.map((row) => within(row).getAllByRole("button")[0]?.textContent)).toEqual([
      "Bayline Freight",
      "Lotus Manufacturing",
      "Northwind Textiles",
      "Pacific Consolidators",
      "Sunrise Ceramics"
    ])
    await expect(canvas.getByRole("columnheader", { name: "Type" })).toBeInTheDocument()
    await expect(canvas.getByText("On Copacker")).toBeVisible()
    await expect(canvas.getByText("Invited")).toBeVisible()
    await expect(canvas.getByText("Invitation expired")).toBeVisible()
    await expect(canvas.getAllByText("Not invited")).toHaveLength(2)
    // Suppliers without their own lead time use the workspace's 60 days.
    await expect(canvas.getAllByText("Lead time 60 days")).toHaveLength(2)
    await expect(canvas.getByText("Lead time 45 days, 1 address")).toBeInTheDocument()
  }
})

// A partner's row opens it: a supplier to edit, a forwarder's addresses.
export const OpenPartner = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Northwind Textiles" }))
    const dialog = await screen.findByRole("dialog", { name: "Edit Northwind Textiles" })
    await expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Northwind Textiles")
  }
})

export const Suppliers = meta.story({
  args: { type: "supplier", restockLeadTimeDays: 30 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Suppliers" })).toHaveAttribute("aria-current", "page")
    await expect(canvas.queryByText("Bayline Freight")).toBeNull()
    await expect(canvas.queryByRole("columnheader", { name: "Type" })).toBeNull()
    await expect(canvas.getAllByText("Lead time 30 days")).toHaveLength(2)
    // The search keeps the tab.
    await expect(canvas.getByRole("searchbox", { name: "Search partners" })).toBeInTheDocument()
    await expect(canvas.getByDisplayValue("supplier")).toHaveAttribute("name", "type")
  }
})

export const Forwarders = meta.story({
  args: { type: "forwarder" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Bayline Freight")).toBeVisible()
    await expect(canvas.getByText("Pacific Consolidators")).toBeVisible()
    await expect(canvas.queryByText("Lotus Manufacturing")).toBeNull()
  }
})

// A search matches names and the supplier names from Shopify, and keeps its words in the tab links.
export const Searched = meta.story({
  args: { q: "lotus manufacturing co" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Lotus Manufacturing")).toBeVisible()
    await expect(canvas.getAllByRole("row")).toHaveLength(2)
    await expect(canvas.getByRole("searchbox", { name: "Search partners" })).toHaveValue("lotus manufacturing co")
    await expect(canvas.getByRole("link", { name: "Suppliers" })).toHaveAttribute(
      "href",
      "/partners?type=supplier&q=lotus+manufacturing+co"
    )
  }
})

export const NoMatch = meta.story({
  args: { q: "acme" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No partners match “acme”")).toBeVisible()
    await expect(canvas.getByText("Check the spelling, or search another tab.")).toBeVisible()
  }
})

export const Empty = meta.story({
  args: { partners: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No partners yet")).toBeVisible()
    await expect(canvas.getByText("Suppliers from Shopify show up here.")).toBeVisible()
  }
})

export const NoForwarders = meta.story({
  args: { type: "forwarder", partners: partners.filter((row) => row.type === "supplier") },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No forwarders yet")).toBeVisible()
    await expect(canvas.getByText("Add a freight forwarder to ship purchase orders through it.")).toBeVisible()
  }
})

// A member who only views partners can't add or change them.
export const ViewOnly = meta.story({
  args: { permissions: viewer },
  parameters: { permissions: viewer },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Add partner" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "More actions for Northwind Textiles" }))
    await screen.findByRole("menuitem", { name: "Addresses" })
    await expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull()
  }
})
