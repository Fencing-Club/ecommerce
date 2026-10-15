import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { OrderReviser } from "@/components/supplier/order-reviser"
import { db } from "@/db"
import { organizations } from "@/db/schema"
import { requirePage, session, titleFor } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { reviseContext } from "@/server/order-proposals"
import { matchSupplierCatalog } from "@/server/supplier-catalog-match"

export const generateMetadata = titleFor("orders.revise.title", "orders", "edit")

export default withRequest(async function ReviseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const [s, t] = await Promise.all([session(), getTranslations("orders.revise")])
  // A malformed id, such as /orders/abc/revise, finds nothing, like an unknown one.
  const parsed = z.uuid().safeParse((await params).id)
  if (!parsed.success) {
    notFound()
  }
  const id = parsed.data
  if (s.org.kind !== "supplier") {
    redirect(`/orders/${id}`)
  }
  requirePage(s, "orders", "edit")
  const { order, latest, changeable, products } = await reviseContext(s, id)
  if (order.status !== "submitted" || !changeable) {
    redirect(`/orders/${id}`)
  }
  const { data } = order
  const [customer] = await db()
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, order.buyerOrgId))
  // A pending proposal is edited from where the supplier left it: its lines, terms, ready date and note.
  const proposal = latest?.status === "pending" ? latest.data : null
  const original = (itemId: string | undefined) => data.items.find((item) => item.id === itemId)
  const items = (
    proposal?.lines ??
    data.items.map((item) => ({
      itemId: item.id,
      supplierSku: item.supplierSku,
      title: item.name,
      pieces: item.pieces,
      unitPrice: item.unitPrice
    }))
  ).map((line) => {
    const item = original(line.itemId)
    return {
      itemId: line.itemId,
      name: item?.name ?? line.title,
      variant: item?.variant && item.variant !== "Default Title" ? item.variant : "",
      supplierSku: line.supplierSku,
      piecesPerSet: item?.piecesPerSet ?? 1,
      pieces: line.pieces,
      unitPrice: line.unitPrice,
      original: item ? { pieces: item.pieces, unitPrice: item.unitPrice } : undefined
    }
  })
  // Removed lines stay listed, so the supplier can put them back.
  const removed = proposal
    ? data.items
        .filter((item) => !proposal.lines.some((line) => line.itemId === item.id))
        .map((item) => ({
          itemId: item.id,
          name: item.name,
          variant: item.variant !== "Default Title" ? item.variant : "",
          supplierSku: item.supplierSku,
          piecesPerSet: item.piecesPerSet,
          pieces: item.pieces,
          unitPrice: item.unitPrice,
          original: { pieces: item.pieces, unitPrice: item.unitPrice },
          removed: true
        }))
    : []
  const current = { paymentTerms: data.paymentTerms, readyDate: data.readyDate ?? null }
  return (
    <OrderReviser
      orderId={id}
      revision={order.revision}
      reference={data.reference}
      customer={customer?.name ?? t("yourCustomer")}
      currency={data.currency}
      items={[...items, ...removed]}
      subtotal={data.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0)}
      current={current}
      terms={
        proposal
          ? { paymentTerms: proposal.paymentTerms, readyDate: proposal.readyDate, note: proposal.note }
          : { ...current, note: "" }
      }
      proposalPending={proposal !== null}
      products={products.map((product) => {
        const match = matchSupplierCatalog(
          { supplierOrgId: product.supplierOrgId, supplierSku: product.supplierSku, currency: data.currency },
          products
        )
        return {
          supplierSku: product.supplierSku,
          title: product.title,
          unitPrice: match.unitPriceMinor,
          minimumPieces: match.rules?.minimum ?? 1
        }
      })}
    />
  )
})
