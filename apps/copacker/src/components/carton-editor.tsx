import type { OrderInput } from "@repo/aisle"
import { CircleAlert, Copy, Ellipsis, Search, Trash2 } from "lucide-react"
import { useId, useState } from "react"
import { useFormatter, useTranslations } from "use-intl"
import { cartonGroupLabel, type CartonGroup } from "@/lib/carton-groups"
import { cn } from "@/lib/utils"
import { ProductIdentity } from "./product-identity"
import { Button } from "./ui/button"
import { Checkbox } from "./ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group"

export type CartonIssue = { message: string; field?: string; fields?: string[] }

function NumberField({
  label,
  prefix,
  value,
  onChange,
  onBlur,
  invalid,
  readOnly,
  integer = false,
  className,
  errorId
}: {
  label: string
  prefix?: string
  value: number
  onChange: (value: number) => void
  onBlur: () => void
  invalid?: boolean
  readOnly: boolean
  integer?: boolean
  className?: string
  errorId?: string
}) {
  const format = useFormatter()
  if (readOnly) {
    return (
      <span
        className={cn(
          "flex h-9 items-center justify-end gap-2 px-3 tabular-nums",
          className,
          "h-auto w-auto flex-none px-0"
        )}
      >
        {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
        {Number.isFinite(value) ? format.number(value) : "—"}
      </span>
    )
  }
  return (
    <InputGroup className={cn("h-11 bg-background sm:h-9", className)}>
      {prefix && <InputGroupAddon className="text-xs">{prefix}</InputGroupAddon>}
      <InputGroupInput
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        min={0}
        step={integer ? 1 : "any"}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        onBlur={onBlur}
        className="h-full min-w-0 text-end tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </InputGroup>
  )
}

function CartonProducts({
  carton,
  products,
  remainingPieces,
  context,
  onAdd
}: {
  carton: CartonGroup
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
  const title = t("addProductsTo", { carton: carton.cartonId })
  const visible = products.filter((item) =>
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
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-start font-normal text-muted-foreground sm:h-9"
          />
        }
      >
        <Search aria-hidden />
        {title}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
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
                const added = carton.items.some((content) => content.itemId === item.id)
                return (
                  <label key={item.id} className="flex items-start gap-3 p-4">
                    <Checkbox
                      className="mt-1"
                      aria-labelledby={`${selectionId}-${item.id}`}
                      disabled={added}
                      checked={added || selected.includes(item.id)}
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
                      {added && <p className="mt-1 text-xs text-muted-foreground">{t("alreadyAdded")}</p>}
                    </div>
                    <span className="shrink-0 pt-1 text-end text-sm tabular-nums">
                      {t(item.piecesPerSet > 1 ? "packCount" : "unitCount", {
                        count: Math.max(0, remainingPieces[item.id] ?? 0) / item.piecesPerSet
                      })}
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
            {t("addToCarton", { carton: carton.cartonId })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CartonEditor({
  value,
  products,
  onChange,
  onDuplicate,
  onDelete,
  issues = [],
  remainingPieces,
  context,
  readOnly = false,
  showErrors = false
}: {
  value: CartonGroup
  products: OrderInput["items"]
  onChange?: (value: CartonGroup) => void
  onDuplicate?: () => void
  onDelete?: () => void
  issues?: CartonIssue[]
  remainingPieces?: Record<string, number>
  context?: string
  readOnly?: boolean
  showErrors?: boolean
}) {
  const t = useTranslations("orders.cartonEditor")
  const packing = useTranslations("orders.packing")
  const identity = useTranslations("orders.detail")
  const format = useFormatter()
  const errorId = useId()
  const [touched, setTouched] = useState<string[]>([])
  const title = t("carton", { carton: value.cartonId })
  const heading =
    value.count > 1 && value.cartonIds?.length === value.count
      ? t("cartonGroup", { cartons: cartonGroupLabel(value.cartonIds.map((id) => ({ id }))) })
      : title
  const update = (patch: Partial<CartonGroup>) => onChange?.({ ...value, ...patch })
  const touch = (field: string) => setTouched((current) => (current.includes(field) ? current : [...current, field]))
  const fields = ["count", "length", "width", "height", "weight"] as const
  const errors = [...issues]
  for (const field of fields) {
    const number = value[field]
    if (
      (showErrors || touched.includes(field) || Number.isFinite(number)) &&
      (!Number.isFinite(number) || number <= 0 || (field === "count" && (!Number.isInteger(number) || number > 1000)))
    ) {
      errors.push({ field, message: t("enterNumber", { field: t(field) }) })
    }
  }
  for (const [index, content] of value.items.entries()) {
    const item = products.find((product) => product.id === content.itemId)
    const quantity = content.pieces / (item?.piecesPerSet ?? 1)
    const field = `items.${index}`
    if (
      (showErrors || touched.includes(field) || Number.isFinite(quantity)) &&
      (!Number.isInteger(quantity) || quantity <= 0)
    ) {
      errors.push({ field, message: t("enterQuantity", { sku: item?.buyerSku ?? content.itemId }) })
    }
  }
  if (showErrors && !value.items.length) {
    errors.push({ message: t("addProductRequired") })
  }
  const invalid = (field: string) => errors.some((issue) => issue.field === field || issue.fields?.includes(field))
  return (
    <section aria-label={title} className="@container/carton overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 bg-muted/60 p-4 @3xl/carton:grid-cols-[minmax(0,1fr)_auto_auto]">
        <h3 className="text-sm font-semibold">{heading}</h3>
        <div className="order-3 col-span-2 flex flex-wrap items-center gap-x-5 gap-y-3 @3xl/carton:order-2 @3xl/carton:col-span-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("count")}</span>
            <NumberField
              label={`${title}: ${t("count")}`}
              value={value.count}
              onChange={(count) => update({ count })}
              onBlur={() => touch("count")}
              invalid={invalid("count")}
              integer
              readOnly={readOnly}
              errorId={errorId}
              className="w-20"
            />
          </div>
          <div className="order-3 flex w-full flex-wrap items-center gap-2 @xl/carton:order-2 @xl/carton:w-auto">
            <span className="shrink-0 text-xs text-muted-foreground">{t("dimensions")}</span>
            <div className="flex min-w-0 flex-1 gap-2 @xl/carton:flex-none">
              {(["length", "width", "height"] as const).map((field) => (
                <NumberField
                  key={field}
                  label={`${title}: ${packing(`dimensions.${field}`)}`}
                  prefix={t(`axis.${field}`)}
                  value={value[field]}
                  onChange={(number) => update({ [field]: number })}
                  onBlur={() => touch(field)}
                  invalid={invalid(field)}
                  readOnly={readOnly}
                  errorId={errorId}
                  className="min-w-0 flex-1 @xl/carton:w-18 @xl/carton:flex-none"
                />
              ))}
            </div>
          </div>
          <div className="order-2 flex items-center gap-2 @xl/carton:order-3">
            <span className="text-xs text-muted-foreground">{t("weight")}</span>
            <NumberField
              label={`${title}: ${packing("dimensions.weight")}`}
              prefix="kg"
              value={value.weight}
              onChange={(weight) => update({ weight })}
              onBlur={() => touch("weight")}
              invalid={invalid("weight")}
              readOnly={readOnly}
              errorId={errorId}
              className="w-24"
            />
          </div>
        </div>
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="order-2 @3xl/carton:order-3"
                  aria-label={t("actions", { carton: value.cartonId })}
                />
              }
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44 whitespace-nowrap">
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy />
                {t("duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete}>
                <Trash2 />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="hidden justify-between gap-4 border-b bg-muted/60 px-4 py-2 text-xs text-muted-foreground @sm/carton:flex">
        <span>{packing("product")}</span>
        <span className={cn("w-36 text-end", !readOnly && "me-12")}>{t("quantityPerCarton")}</span>
      </div>
      <div className={cn("divide-y", invalid("items") && "ring-1 ring-inset ring-destructive")}>
        {value.items.map((content, index) => {
          const item = products.find((product) => product.id === content.itemId)
          if (!item) {
            return null
          }
          const field = `items.${index}`
          return (
            <div
              key={content.itemId}
              className="flex flex-wrap items-start justify-between gap-4 p-4 @sm/carton:flex-nowrap"
            >
              <div className="w-full min-w-0 [overflow-wrap:anywhere] @sm/carton:flex-1">
                <ProductIdentity item={item} showPackSize={false} />
              </div>
              <span className="self-center text-xs @sm/carton:hidden">
                {item.piecesPerSet > 1 ? t("packsPerCarton") : t("unitsPerCarton")}
                {item.piecesPerSet > 1 && (
                  <span className="mt-1 block text-muted-foreground">
                    {identity("perPack", { count: item.piecesPerSet })}
                  </span>
                )}
              </span>
              <div className="ms-auto flex items-start gap-3">
                <div className="flex w-28 flex-col gap-1 @sm/carton:w-36">
                  {item.piecesPerSet > 1 && (
                    <p className="hidden text-end text-xs text-muted-foreground @sm/carton:block">
                      {identity("perPack", { count: item.piecesPerSet })}
                    </p>
                  )}
                  <NumberField
                    label={t("productQuantity", { sku: item.buyerSku, carton: value.cartonId })}
                    value={content.pieces / item.piecesPerSet}
                    onChange={(quantity) =>
                      update({
                        items: value.items.map((row, i) =>
                          i === index ? { ...row, pieces: quantity * item.piecesPerSet } : row
                        )
                      })
                    }
                    onBlur={() => touch(field)}
                    invalid={invalid(field)}
                    integer
                    readOnly={readOnly}
                    errorId={errorId}
                  />
                  {item.piecesPerSet > 1 && Number.isFinite(content.pieces) && (
                    <p className="pe-3 text-end text-xs text-muted-foreground">
                      {t("unitCount", { count: content.pieces })}
                    </p>
                  )}
                </div>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11 sm:size-9"
                    aria-label={t("removeProduct", { sku: item.buyerSku, carton: value.cartonId })}
                    onClick={() => update({ items: value.items.filter((_, i) => i !== index) })}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {errors.length > 0 && (
        <ul id={errorId} aria-live="polite" className="flex flex-col gap-2 border-t px-4 py-3 text-xs text-destructive">
          {errors.map((issue, index) => (
            <li key={`${issue.message}-${index}`} className="flex items-start gap-2">
              <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="border-t p-3">
          <CartonProducts
            carton={value}
            products={products}
            context={context}
            remainingPieces={
              remainingPieces ??
              Object.fromEntries(
                products.map((item) => [
                  item.id,
                  item.pieces - (value.items.find((content) => content.itemId === item.id)?.pieces || 0) * value.count
                ])
              )
            }
            onAdd={(ids) =>
              update({
                items: [
                  ...value.items,
                  ...ids
                    .filter((id) => !value.items.some((item) => item.itemId === id))
                    .map((itemId) => ({ itemId, pieces: Number.NaN }))
                ]
              })
            }
          />
        </div>
      )}
      {readOnly && (
        <span className="sr-only">
          {t("unitCount", { count: value.items.reduce((sum, item) => sum + (item.pieces || 0), 0) * value.count })},{" "}
          {format.number(value.count)} {t("count")}
        </span>
      )}
    </section>
  )
}
