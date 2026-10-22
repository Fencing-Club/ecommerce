import { redirect } from "@tanstack/react-router"
import { and, eq, isNull } from "drizzle-orm"
import type * as React from "react"
import type { ImportReview } from "@/components/import-review"
import type { ReviewProduct } from "@/components/import-review-lines"
import { db } from "@/db"
import { poImports, suppliers } from "@/db/schema"
import { NotFoundError } from "@/i18n/errors"
import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { shopifyFor } from "@/server/connections"
import { importProposalSchema } from "@/server/import-proposal"
import { pageId } from "@/server/page-id"

export async function reviewImportPage(params: { id: string }): Promise<React.ComponentProps<typeof ImportReview>> {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  requirePage(s, "prices")
  const id = pageId(params.id)
  const [record] = await db()
    .select()
    .from(poImports)
    .where(and(eq(poImports.id, id), eq(poImports.orgId, s.org.id)))
  if (!record) {
    throw new NotFoundError()
  }
  if (record.status === "saved" && record.orderId) {
    throw redirect({ href: `/orders/${record.orderId}` })
  }
  if (record.status !== "review") {
    throw redirect({ href: "/orders/import" })
  }
  const rows = await db()
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
  const proposal = importProposalSchema.parse(record.proposal)
  const selectedIds = [
    ...new Set(proposal.items.flatMap((item) => (item.selectedVariantId ? [item.selectedVariantId] : [])))
  ]
  const selectedProducts: Record<string, ReviewProduct> = {}
  try {
    if (selectedIds.length) {
      const shop = await shopifyFor(s.org.id, record.shopifyDomain)
      for (let offset = 0; offset < selectedIds.length; offset += 100) {
        for (const product of await shop.variants(selectedIds.slice(offset, offset + 100))) {
          if (product) {
            selectedProducts[product.id] = { title: product.product.title, variant: product.title, sku: product.sku }
          }
        }
      }
    }
  } catch {
    // Keep corrections available during a catalog outage; saving still verifies every selected identity.
  }
  return {
    id: id,
    filename: record.filename,
    initialRevision: record.revision,
    initialProposal: proposal,
    initialSelectedProducts: selectedProducts,
    suppliers: rows
  }
}
