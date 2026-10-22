import { money, type OrderInput } from "@repo/copacker-orders"
import { CircleCheck } from "lucide-react"
import type { ReactNode } from "react"
import { useLocale, useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type CartonGroup, packedPieces, physicalCartons, piecesLeft } from "@/lib/carton-groups"
import { cn } from "@/lib/utils"
import { PackingSection } from "./packing-section"
import { ProductIdentity } from "./product-identity"

// The shipment's products, closed until opened: the purchase order's lines as the carton cards show products (name and
// variation, supplier SKU), then how many the cartons hold of what's left to ship, and the price for someone who sees
// prices. While packing, the line beside the title counts the units still to pack. Below 44rem, where the carton and
// pallet tables turn into cards too, each line stacks, with its column names above the values.
export function PackedProductsTable({
  order,
  cartons,
  reserved,
  progress = false,
  renderActions
}: {
  order: OrderInput
  cartons: CartonGroup[]
  // The pieces of each line the purchase order's other shipments hold.
  reserved: Readonly<Record<string, number>>
  progress?: boolean
  // Beside each line, such as its label downloads.
  renderActions?: (item: OrderInput["items"][number]) => ReactNode
}) {
  const t = useTranslations("orders.packing")
  const detail = useTranslations("orders.detail")
  const locale = useLocale()
  // Purchase-order values are read-only during packing.
  const prices = useCan("prices")
  const packed = packedPieces(physicalCartons(cartons))
  const products = order.items.length
  const left = order.items.reduce(
    (sum, item) => sum + Math.max(piecesLeft(item, reserved) - (packed[item.id] ?? 0), 0),
    0
  )
  // A line packed past what's left isn't finished either, even when nothing else is left.
  const overpacked = order.items.some((item) => (packed[item.id] ?? 0) > piecesLeft(item, reserved))
  const done = !!progress && left === 0 && !overpacked
  let summary = t("productCount", { products })
  if (progress && left > 0) {
    summary = t("productsLeft", { products, count: left })
  } else if (done) {
    summary = t("productsPacked", { products })
  }
  return (
    <PackingSection title={detail("columns.products")} summary={summary} done={done} defaultOpen={false}>
      <div className="@container/packing">
        <Table inset className="table-fixed narrow:block">
          <TableHeader className="bg-muted/60 narrow:hidden [&_th]:h-8 [&_th]:text-xs [&_th]:font-normal [&_th]:text-muted-foreground">
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("product")}</TableHead>
              <TableHead className="w-36">{t("supplierSku")}</TableHead>
              <TableHead className="w-28 text-end">{t("packed")}</TableHead>
              {prices && <TableHead className="w-28 text-end">{t("pricePerUnit")}</TableHead>}
              {renderActions && (
                <TableHead className="w-14">
                  <span className="sr-only">{detail("columns.actions")}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody className="narrow:block">
            {order.items.map((item) => {
              const available = piecesLeft(item, reserved)
              const count = packed[item.id] ?? 0
              return (
                <TableRow
                  key={item.id}
                  className="hover:bg-transparent narrow:relative narrow:grid narrow:grid-cols-3 narrow:gap-x-4 narrow:gap-y-2 narrow:p-4 [&>td]:py-3 [&>td]:align-top narrow:[&>td]:p-0"
                >
                  <TableCell className="whitespace-normal [overflow-wrap:anywhere] narrow:col-span-3 narrow:ps-0! narrow:pe-10!">
                    <ProductIdentity item={item} showSku={false} showPackSize={false} />
                  </TableCell>
                  <TableCell className="whitespace-normal [overflow-wrap:anywhere]">
                    <span className="mb-1 block text-xs text-muted-foreground wide:hidden">{t("supplierSku")}</span>
                    {item.components?.length ? (
                      <span className="flex flex-col gap-1">
                        {item.components.map((component) => (
                          <span key={component.variantId}>
                            {component.quantity} × {component.supplierSku || component.buyerSku || "—"}
                          </span>
                        ))}
                      </span>
                    ) : (
                      item.supplierSku || "—"
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums narrow:text-start">
                    <span className="mb-1 block text-xs text-muted-foreground wide:hidden">{t("packed")}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        available > 0 && count === available && "text-success",
                        count > available && "text-destructive"
                      )}
                    >
                      {available > 0 && count === available && <CircleCheck aria-hidden className="size-3.5" />}
                      {t("packedOf", { count, available })}
                    </span>
                    {count < available && (
                      <span className="block text-xs text-muted-foreground">
                        {t("leftCount", { count: available - count })}
                      </span>
                    )}
                    {count > available && (
                      <span className="block text-xs text-destructive">
                        {t("overCount", { count: count - available })}
                      </span>
                    )}
                  </TableCell>
                  {prices && (
                    <TableCell className="text-end tabular-nums narrow:text-start">
                      <span className="mb-1 block text-xs text-muted-foreground wide:hidden">{t("pricePerUnit")}</span>
                      {money(item.unitPrice, order.currency, locale)}
                    </TableCell>
                  )}
                  {renderActions && (
                    <TableCell className="py-2! text-end narrow:absolute narrow:end-3 narrow:top-3">
                      {renderActions(item)}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </PackingSection>
  )
}
