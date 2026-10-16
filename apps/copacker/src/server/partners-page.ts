import { can } from "@/lib/access"
import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import type { PartnerForwarder } from "@/server/partners"
import type { PartnerSupplier } from "@/server/partners"
import { listPartners } from "@/server/partners"
import { restockSettings } from "@/server/restock-report"
import { serverTranslator } from "@/server/translation"

const tabs = [{ key: "all" }, { key: "supplier" }, { key: "forwarder" }] as const
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

export async function partnersPage(input: { query: Record<string, string | string[]> }) {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "partners")
  const t = await serverTranslator("partners.page")
  const editable = can(s, "partners", "edit")
  const params = input.query
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
  let emptyHint = tab === "forwarder" ? t("hints.forwarder") : t("hints.supplier")
  if (q) {
    emptyHint = t("hints.search")
  }
  const showType = tab === "all"

  return {
    editable,
    tab,
    q,
    defaultLeadTimeDays,
    emptyHint,
    showType,
    shown: shown.map((row) =>
      row.type === "supplier"
        ? { type: "supplier" as const, id: row.id, supplier: supplierDetails(row.supplier) }
        : { type: "forwarder" as const, id: row.id, forwarder: forwarderDetails(row.forwarder) }
    )
  }
}
