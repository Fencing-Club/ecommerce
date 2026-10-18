import type { ReactNode } from "react"
import { useTranslations } from "use-intl"
import { cn } from "@/lib/utils"

/** The field's basis is explicit: orders count units, cartons count sellable packs. */
export function QuantityDisplay({
  pieces,
  packSize,
  basis = "units",
  children,
  className
}: {
  pieces: number
  packSize: number
  basis?: "units" | "packs"
  children: ReactNode
  className?: string
}) {
  const t = useTranslations("orders")
  const multipack = Number.isInteger(packSize) && packSize > 1
  const valid = Number.isInteger(pieces) && pieces >= 0 && pieces % packSize === 0
  return (
    <div className={cn("flex flex-col gap-1 text-end tabular-nums", className)}>
      {children}
      {multipack && basis === "packs" && (
        <span className="text-xs text-muted-foreground">{t("detail.perPack", { count: packSize })}</span>
      )}
      {multipack && valid && (
        <span className="text-xs text-muted-foreground">
          {basis === "packs"
            ? t("cartonEditor.unitCount", { count: pieces })
            : t("builder.packCount", { count: pieces / packSize, size: packSize })}
        </span>
      )}
    </div>
  )
}
