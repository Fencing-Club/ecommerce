import type { OrderInput } from "@repo/copacker-shipments"
import { Plus, Search } from "lucide-react"
import { useId, useState } from "react"
import { useTranslations } from "use-intl"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ProductIdentity } from "./product-identity"

// Adds products to a carton configuration from the shipment's products that still have units left to pack.
export function CartonProductsDialog({
  label,
  added,
  products,
  remainingPieces,
  context,
  onAdd
}: {
  // The button's name, such as "Add products to cartons A1–A10".
  label: string
  // The products already in the carton.
  added: string[]
  products: OrderInput["items"]
  remainingPieces: Record<string, number>
  context?: string
  onAdd: (ids: string[]) => void
}) {
  const t = useTranslations("orders.cartonEditor")
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const selectionId = useId()
  const visible = products.filter(
    (item) =>
      (remainingPieces[item.id] ?? 0) > 0 &&
      `${item.name} ${item.variant} ${item.buyerSku}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  )
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setSelected([])
          setQuery("")
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" aria-label={label} />}>
        <Plus aria-hidden />
        {t("addProduct")}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("addProducts")}</DialogTitle>
          <DialogDescription>{context ?? t("shipmentProducts")}</DialogDescription>
        </DialogHeader>
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t("searchProducts")}
            placeholder={t("searchProducts")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
        <div className="overflow-hidden rounded-lg border">
          <div className="flex justify-between gap-4 bg-muted px-4 py-2 text-xs text-muted-foreground">
            <span>{t("product")}</span>
            <span>{t("leftToPack")}</span>
          </div>
          {[...Map.groupBy(visible, (item) => item.name)].map(([name, variants]) => (
            <section key={name} className="border-b last:border-b-0">
              <h3 className="px-4 pt-4 text-sm font-medium">{name}</h3>
              {variants.map((item) => {
                const already = added.includes(item.id)
                return (
                  <label key={item.id} className="flex items-start gap-3 p-4">
                    <Checkbox
                      className="mt-1"
                      aria-labelledby={`${selectionId}-${item.id}`}
                      disabled={already}
                      checked={already || selected.includes(item.id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked ? [...current, item.id] : current.filter((id) => id !== item.id)
                        )
                      }
                    />
                    <span id={`${selectionId}-${item.id}`} className="sr-only">
                      {item.name} {item.variant}
                    </span>
                    <div className="min-w-0 flex-1">
                      <ProductIdentity item={item} showName={false} />
                      {already && <p className="mt-1 text-xs text-muted-foreground">{t("alreadyAdded")}</p>}
                    </div>
                    <span className="shrink-0 pt-1 text-end text-sm tabular-nums">
                      {t("unitCount", { count: Math.max(0, remainingPieces[item.id] ?? 0) })}
                    </span>
                  </label>
                )
              })}
            </section>
          ))}
          {!visible.length && <p className="p-4 text-sm text-muted-foreground">{t("noProducts")}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="me-auto text-xs text-muted-foreground">
            {t("selectedCount", { count: selected.length })}
          </span>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={!selected.length}
            onClick={() => {
              onAdd(selected)
              setOpen(false)
              setSelected([])
              setQuery("")
            }}
          >
            {t("addToCarton")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
