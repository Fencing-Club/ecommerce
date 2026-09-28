import { Search } from "lucide-react"
import type { Metadata } from "next"
import { EmptyState, PageHeader } from "@/components/common"
import { AddPartner, ForwarderRow, SupplierRow } from "@/components/partner-actions"
import { TabLinks } from "@/components/tab-links"
import { Card } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { can } from "@/lib/access"
import { requireBuyer, requirePage, session } from "@/server/auth"
import { listPartners, type PartnerForwarder, type PartnerSupplier } from "@/server/partners"
import { restockSettings } from "@/server/restock-report"

export const metadata: Metadata = { title: "Partners" }

const tabs = [
  { key: "all", label: "All" },
  { key: "supplier", label: "Suppliers" },
  { key: "forwarder", label: "Forwarders" }
] as const

// A partner's address, without the workspace and partner it's stored with.
function addressDetails(contact: PartnerSupplier["addresses"][number]) {
  return { id: contact.id, name: contact.name, address: contact.address }
}

// What a partner's row needs, leaving its invitation hash and dates on the server.
function supplierDetails(row: PartnerSupplier) {
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

function forwarderDetails(row: PartnerForwarder) {
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

// A tab's link, keeping the search.
function tabHref(tab: string, q: string) {
  const params = new URLSearchParams({ ...(tab !== "all" && { type: tab }), ...(q && { q }) })
  return params.size ? `/partners?${params}` : "/partners"
}

// Everyone the buyer works with in one list: suppliers and freight forwarders. `?q=` filters by name, such as a
// header search for a partner.
export default async function PartnersPage({
  searchParams
}: {
  searchParams: Promise<{ type?: string; q?: string | string[] }>
}) {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "partners")
  const editable = can(s, "partners", "edit")
  const params = await searchParams
  const tab = tabs.find((candidate) => candidate.key === params.type)?.key ?? "all"
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 200)
  const needle = q.toLowerCase()
  const partners = await listPartners(s.org.id)
  const shown = partners.filter(
    (row) =>
      (tab === "all" || row.type === tab) &&
      (!needle ||
        row.name.toLowerCase().includes(needle) ||
        (row.type === "supplier" && (row.supplier.shopifySupplierName ?? "").toLowerCase().includes(needle)))
  )
  const defaultLeadTimeDays = restockSettings(s.org).leadTimeDays
  let emptyHint =
    tab === "forwarder"
      ? "Add a freight forwarder to ship purchase orders through it."
      : "Suppliers from Shopify show up here."
  if (q) {
    emptyHint = "Check the spelling, or search another tab."
  }
  const showType = tab === "all"

  return (
    <>
      <PageHeader title="Partners">{editable && <AddPartner />}</PageHeader>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-2">
          <TabLinks
            label="Partner types"
            tabs={tabs.map((candidate) => ({
              label: candidate.label,
              href: tabHref(candidate.key, q),
              current: candidate.key === tab
            }))}
          />
          {/* A plain GET form: Enter searches, and the tab stays. Keyed by q so a new header search refills it. */}
          <form action="/partners" className="ml-auto w-full sm:w-64">
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
                placeholder="Search partners"
                aria-label="Search partners"
              />
            </InputGroup>
          </form>
        </div>
        {shown.length ? (
          <div className="@container">
            <Table framed={false}>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  {showType && <TableHead className="hidden @2xl:table-cell">Type</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden @2xl:table-cell">Details</TableHead>
                  <TableHead className="w-12 pr-4">
                    <span className="sr-only">Actions</span>
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
          <EmptyState
            title={
              q
                ? `No partners match “${q}”`
                : { all: "No partners yet", supplier: "No suppliers yet", forwarder: "No forwarders yet" }[tab]
            }
            description={emptyHint}
          />
        )}
      </Card>
    </>
  )
}
