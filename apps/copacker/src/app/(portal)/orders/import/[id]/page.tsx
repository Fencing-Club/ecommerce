import { and, eq } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { ImportReview } from "@/components/import-review"
import { db } from "@/db"
import { poImports, suppliers } from "@/db/schema"
import { session, requireBuyer } from "@/server/auth"
import { shopifyFor } from "@/server/connections"
import { importProposalSchema } from "@/server/import-proposal"

export default async function ReviewImport({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  requireBuyer(s)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    notFound()
  }
  const [record] = await db()
    .select()
    .from(poImports)
    .where(and(eq(poImports.id, id), eq(poImports.orgId, s.org.id)))
  if (!record) {
    notFound()
  }
  if (record.status === "saved" && record.orderId) {
    redirect(`/orders/${record.orderId}`)
  }
  if (record.status !== "review") {
    redirect("/orders/import")
  }
  const rows = await db()
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.buyerOrgId, s.org.id))
  const proposal = importProposalSchema.parse(record.proposal)
  const selectedIds = [
    ...new Set(proposal.items.flatMap((item) => (item.selectedVariantId ? [item.selectedVariantId] : [])))
  ]
  const selectedProducts: Record<string, string> = {}
  try {
    if (selectedIds.length) {
      const shop = await shopifyFor(s.org.id, record.shopifyDomain)
      for (let offset = 0; offset < selectedIds.length; offset += 100) {
        for (const product of await shop.variants(selectedIds.slice(offset, offset + 100))) {
          if (product) {
            selectedProducts[product.id] =
              `${product.product.title} / ${product.title} / ${product.sku ?? "No buyer SKU"}`
          }
        }
      }
    }
  } catch {
    // Keep corrections available during a catalog outage; saving still verifies every selected identity.
  }
  return (
    <ImportReview
      id={id}
      initialRevision={record.revision}
      initialProposal={proposal}
      initialSelectedProducts={selectedProducts}
      suppliers={rows}
    />
  )
}
