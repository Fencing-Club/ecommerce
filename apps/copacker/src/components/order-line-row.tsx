import { itemTotal, productLabel } from "@repo/copacker-shipments"
import { Ellipsis, Package, X } from "lucide-react"
import { useState } from "react"
import { useController, useFormContext } from "react-hook-form"
import { useTranslations } from "use-intl"
import { WarningNote } from "@/components/common"
import { FormError } from "@/components/form-feedback"
import { MoneyInput } from "@/components/money-input"
import { LineLabelMenuItems } from "@/components/order-actions"
import { PackingRequirementsDialog } from "@/components/packing-requirements-dialog"
import { ProductIdentity } from "@/components/product-identity"
import { QuantityDisplay } from "@/components/quantity-display"
import { SupplierSkuCell } from "@/components/supplier-sku-cell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useMoney } from "@/hooks/use-money"
import { quantityProblem } from "@/lib/catalog-pricing"
import type { OrderForm } from "@/lib/order-form"
import { type LineQuote, matchNote } from "@/lib/order-quotes"
import { cn } from "@/lib/utils"

type Item = OrderForm["items"][number]

// One line of the purchase order editor's products table: the product, its supplier SKU, quantity and cost, edited in
// place, with the supplier's quote under them, its total, and its menu. `select` is its checkbox for moving it to
// another Amazon network, on a PO to Amazon. Each field is the form's own `items.<index>`.
export function OrderLineRow({
  index,
  item,
  quote,
  currency,
  orderId,
  toAmazon,
  needsLabel,
  error,
  select,
  onPiecesChange,
  onPriceChange,
  onRemove
}: {
  index: number
  item: Item
  // The supplier's quote, once its catalog answers.
  quote?: LineQuote
  currency: string
  // A saved draft's id, for its lines' label downloads.
  orderId?: string
  toAmazon: boolean
  // Its product needs an uploaded label that it doesn't have yet.
  needsLabel: boolean
  error?: string
  select?: { selected: boolean; onSelectedChange: (selected: boolean) => void }
  onPiecesChange: () => void
  // The buyer typed a price of their own.
  onPriceChange: () => void
  onRemove: () => void
}) {
  const t = useTranslations("orders")
  const money = useMoney()
  const note = quote && matchNote(quote.status)
  const available = quote?.available ?? null
  const ruleProblem = quote?.rules && item.pieces ? quantityProblem(quote.rules, item.pieces, "piece") : null
  return (
    <tr className={cn("border-t align-top", select?.selected && "bg-accent/50")}>
      {select && (
        <td className="px-3 py-4">
          <Checkbox
            aria-label={t("builder.selectProduct", { name: productLabel(item.name, item.variant) })}
            checked={select.selected}
            onCheckedChange={select.onSelectedChange}
          />
        </td>
      )}
      <td className="px-3 py-2.5">
        <ProductIdentity item={item} />
        {needsLabel && (
          <p className="mt-1">
            <WarningNote>{t("builder.needsLabel")}</WarningNote>
          </p>
        )}
        <FormError message={error} />
      </td>
      <td className="px-2 py-2">
        <SupplierSkuCell item={item} className="py-1.5 text-xs text-muted-foreground">
          <CellInput index={index} label={t("builder.supplierSkuFor", { name: item.name })} />
        </SupplierSkuCell>
      </td>
      <td className="px-2 py-2">
        <QuantityDisplay pieces={item.pieces ?? Number.NaN} packSize={item.piecesPerSet}>
          <CellPieces
            index={index}
            label={t("builder.quantityOf", { name: item.name })}
            packSize={item.piecesPerSet}
            onValueChange={onPiecesChange}
          />
        </QuantityDisplay>
        {available !== null && (
          <p
            className={cn(
              "mt-1 text-xs",
              (item.pieces ?? 0) > available ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {t("builder.available", { count: available })}
          </p>
        )}
        {ruleProblem && (
          <p className="mt-1">
            <WarningNote>{ruleProblem}</WarningNote>
          </p>
        )}
      </td>
      <td className="px-2 py-2">
        <CellPrice
          index={index}
          label={t("builder.costOf", { name: item.name })}
          currency={currency}
          onValueChange={onPriceChange}
        />
        {note && <p className="mt-1 text-xs text-muted-foreground">{t(`builder.matchNotes.${note}`)}</p>}
      </td>
      <td className="px-2 py-3.5 text-end tabular-nums">{money(itemTotal(item), currency)}</td>
      <td className="py-2 pe-2">
        <div className="flex justify-end">
          <LineMenu index={index} name={item.name} orderId={orderId} item={item} toAmazon={toAmazon} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("builder.remove", { name: item.name })}
            onClick={onRemove}
          >
            <X />
          </Button>
        </div>
      </td>
    </tr>
  )
}

function CellInput({ index, label }: { index: number; label: string }) {
  const {
    field: { value, onChange, onBlur, ref },
    fieldState
  } = useController<OrderForm, `items.${number}.supplierSku`>({ name: `items.${index}.supplierSku` })
  return (
    <Input
      ref={ref}
      aria-label={label}
      value={value ?? ""}
      onChange={onChange}
      onBlur={onBlur}
      aria-invalid={fieldState.invalid}
    />
  )
}

// A line's quantity in pieces, which steps by its pack size, so its keypad has no decimal point. A cleared cell holds
// null, which saving asks to fill in: undefined would read back as the line's first value.
function CellPieces({
  index,
  label,
  packSize,
  onValueChange
}: {
  index: number
  label: string
  packSize: number
  onValueChange: () => void
}) {
  const {
    field: { value, onChange, onBlur, ref },
    fieldState
  } = useController<OrderForm, `items.${number}.pieces`>({ name: `items.${index}.pieces` })
  return (
    <Input
      ref={ref}
      type="number"
      inputMode="numeric"
      min={packSize}
      step={packSize}
      aria-label={label}
      value={Number.isFinite(value) ? value : ""}
      onChange={(event) => {
        onChange(event.target.value === "" ? null : Math.round(event.target.valueAsNumber * 1000) / 1000)
        onValueChange()
      }}
      onBlur={onBlur}
      aria-invalid={fieldState.invalid}
      className="text-end tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  )
}

// A line's unit price, which the buyer may type over the one filled in for them.
function CellPrice({
  index,
  label,
  currency,
  onValueChange
}: {
  index: number
  label: string
  currency: string
  onValueChange: () => void
}) {
  const {
    field: { value, onChange, onBlur, ref, name },
    fieldState
  } = useController<OrderForm, `items.${number}.unitPrice`>({ name: `items.${index}.unitPrice` })
  return (
    <MoneyInput
      ref={ref}
      name={name}
      label={label}
      currency={currency}
      value={Number.isFinite(value) ? value : null}
      invalid={fieldState.invalid}
      onValueChange={(amount) => {
        onChange(amount)
        onValueChange()
      }}
      onBlur={onBlur}
    />
  )
}

// A line's menu: its labels once the PO is saved, and its packing details, which start from the product's preparation
// and labels.
function LineMenu({
  index,
  name,
  orderId,
  item,
  toAmazon
}: {
  index: number
  name: string
  orderId?: string
  item: Item
  toAmazon: boolean
}) {
  const t = useTranslations("orders")
  const [packing, setPacking] = useState(false)
  const { getValues, setValue } = useFormContext<OrderForm>()
  function editPacking() {
    const line = getValues(`items.${index}`)
    if (!line.packingRequirements) {
      setValue(`items.${index}.packingRequirements`, {
        preparation: line.prepCategory === "POLYBAGGING" ? "polybag" : "none",
        labels: [
          ...(line.skuLabel === false ? [] : [toAmazon || line.fnsku ? ("fnsku" as const) : ("sku" as const)]),
          ...(line.suffocationWarning ? ["suffocation" as const] : [])
        ],
        countryCode: "",
        instructions: line.instructions ?? ""
      })
    }
    setPacking(true)
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("actions.moreFor", { name })} />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {orderId && (
            <LineLabelMenuItems orderId={orderId} itemId={item.id} label warning={item.suffocationWarning ?? false} />
          )}
          <DropdownMenuItem onClick={editPacking}>
            <Package />
            {t("builder.editPacking")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PackingRequirementsDialog index={index} name={name} open={packing} onOpenChange={setPacking} />
    </>
  )
}
