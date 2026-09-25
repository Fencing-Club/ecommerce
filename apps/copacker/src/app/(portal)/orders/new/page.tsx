import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { PageBreadcrumb, PageHeader } from "@/components/common"
import { OrderBuilder } from "@/components/order-builder"
import { db } from "@/db"
import { suppliers } from "@/db/schema"
import { orderLine } from "@/lib/order-lines"
import { requireBuyer, session } from "@/server/auth"
import { shopifyFor } from "@/server/connections"

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
  const variants = await (await shopifyFor(orgId)).variants(ids)
  return variants.flatMap((variant) => (variant ? [orderLine(variant, randomUUID())] : []))
}

export default async function NewOrder({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const s = await session()
  requireBuyer(s)
  const rows = await db().select().from(suppliers).where(eq(suppliers.buyerOrgId, s.org.id))
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
