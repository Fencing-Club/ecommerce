import { randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { PageBreadcrumb, PageHeader } from "@/components/common"
import { OrderBuilder } from "@/components/order-builder"
import { db } from "@/db"
import { suppliers } from "@/db/schema"
import { orderLine } from "@/lib/order-lines"
import { requireBuyer, session } from "@/server/auth"
import { shopifyFor } from "@/server/connections"
import { lineDefaultsFor } from "@/server/product-defaults"

const variantIds = z
  .array(z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/))
  .max(100)
  .catch([])

// Variants passed as ?variant=… (Reorder on Inventory) start as lines on the new PO.
async function reorderLines(orgId: string, raw: string | string[] | undefined) {
  const ids = [...new Set(variantIds.parse(typeof raw === "string" ? [raw] : (raw ?? [])))]
  if (!ids.length) {
    return []
  }
  const [variants, defaultsFor] = await Promise.all([(await shopifyFor(orgId)).variants(ids), lineDefaultsFor(orgId)])
  return variants.flatMap((variant) => (variant ? [orderLine(variant, randomUUID(), defaultsFor(variant))] : []))
}

export default async function NewOrder({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const s = await session()
  requireBuyer(s)
  const rows = await db()
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
  const initialItems = await reorderLines(s.org.id, (await searchParams).variant)

  return (
    <>
      <PageBreadcrumb parents={[{ label: "Purchase orders", href: "/orders" }]} current="New purchase order" />
      <PageHeader
        title="Create purchase order"
        description="Choose products, set quantities, and give your supplier a clear starting point."
      />
      <OrderBuilder suppliers={rows.map((r) => ({ id: r.id, name: r.name }))} initialItems={initialItems} />
    </>
  )
}
