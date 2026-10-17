import { useTranslations } from "use-intl"
import { Badge } from "@/components/ui/badge"

// The same product identity in purchase orders and shipment packing.
export function ProductIdentity({
  item,
  showName = true,
  showPackSize = true
}: {
  item: { name: string; variant: string; buyerSku: string; piecesPerSet: number }
  showName?: boolean
  showPackSize?: boolean
}) {
  const t = useTranslations("orders.detail")
  return (
    <div>
      {showName && <p className="leading-snug font-medium">{item.name}</p>}
      {item.variant && item.variant !== "Default Title" && (
        <Badge variant="secondary" className="mt-1 h-auto max-w-full flex-wrap justify-start gap-x-1 gap-y-0">
          {item.variant.split(" / ").map((value, index) => (
            <span key={`${index}-${value}`} className="whitespace-nowrap">
              {index > 0 ? ` / ${value}` : value}
            </span>
          ))}
        </Badge>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{item.buyerSku}</p>
      {showPackSize && item.piecesPerSet > 1 && (
        <p className="text-xs text-muted-foreground">{t("perPack", { count: item.piecesPerSet })}</p>
      )}
    </div>
  )
}
