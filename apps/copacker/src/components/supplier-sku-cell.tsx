import type { OrderItem } from "@repo/copacker-shipments"
import { useTranslations } from "use-intl"
import { WarningNote } from "@/components/common"
import { cn } from "@/lib/utils"

// A purchase order line's supplier SKU, so the supplier knows what to make: each component's for a bundle, with how many
// go in it, and otherwise the line's own, or `children` in its place, such as the editor's field for it.
export function SupplierSkuCell({
  item,
  className,
  children
}: {
  // As the editor's form holds it too, where a supplier SKU may not be filled in yet.
  item: Pick<OrderItem, "components"> & { supplierSku?: string }
  // For a bundle's components.
  className?: string
  children?: React.ReactNode
}) {
  const t = useTranslations("orders.detail")
  if (item.components?.length) {
    return (
      <div className={cn("flex flex-col", className)}>
        {item.components.map((component) => (
          <p key={component.variantId}>
            {component.quantity} × {component.supplierSku || component.buyerSku || t("notSet")}
          </p>
        ))}
      </div>
    )
  }
  return children ?? (item.supplierSku || <WarningNote>{t("notSet")}</WarningNote>)
}
