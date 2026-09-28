import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { z } from "zod"
import { OrderReviser } from "@/components/supplier/order-reviser"
import { session } from "@/server/auth"
import { reviseContext } from "@/server/order-proposals"
import { matchSupplierCatalog } from "@/server/supplier-catalog-match"

export const metadata: Metadata = { title: "Edit order" }

export default async function ReviseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  const id = z.uuid().parse((await params).id)
  if (s.org.kind !== "supplier") {
    redirect(`/orders/${id}`)
  }
  const { order, latest, changeable, products } = await reviseContext(s, id)
  if (order.status !== "submitted" || !changeable) {
    redirect(`/orders/${id}`)
  }
  const { data } = order
  // A pending proposal is edited from where the supplier left it.
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
  return (
    <OrderReviser
      orderId={id}
      revision={order.revision}
      reference={data.reference}
      currency={data.currency}
      items={[...items, ...removed]}
      subtotal={data.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0)}
      terms={{ paymentTerms: data.paymentTerms, readyDate: data.readyDate ?? null, note: proposal?.note ?? "" }}
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
}
