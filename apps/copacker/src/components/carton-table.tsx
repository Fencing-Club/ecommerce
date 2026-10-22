import type { ValidationIssue } from "@repo/copacker-packing-rules"
import type { OrderInput } from "@repo/copacker-shipments"
import { cartonGroupLabel } from "@repo/copacker-shipments/shipping-model"
import { ChevronRight, Copy, Ellipsis, Trash2 } from "lucide-react"
import { useId, useState } from "react"
import { useFormatter, useTranslations } from "use-intl"
import { type CartonGroup, groupCartonIds } from "@/lib/carton-groups"
import { cn } from "@/lib/utils"
import { CartonProductsDialog } from "./carton-products-dialog"
import { DimensionsField, FieldError, IssueBadge, NumberField, type RuleSource, useMeasure } from "./packing-fields"
import { useCartonIssueErrors } from "./packing-issues"
import { Button } from "./ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"

type Place = "carton" | "count" | "dimensions" | "weight" | number
// A problem with a carton configuration: where it shows (under the row, a field or a product, by its index), and the
// fields it outlines.
type CartonError = { message: string; place: Place; outlines: string[]; source?: RuleSource }

// One set of columns, so the product band lines up under the cartons: toggle, cartons, count, dimensions, weight,
// contents and the menu. From 50rem the fields have the design's widths, the gaps grow from 1rem to 2rem as there's room,
// and contents takes the rest; from 44rem the columns give a little.
const columns =
  "wide:grid-cols-[2rem_minmax(3.5rem,4.5rem)_minmax(3.5rem,4rem)_minmax(10.75rem,14.75rem)_minmax(5.5rem,6.5rem)_minmax(7.5rem,1fr)_2rem] wide:gap-x-3 wider:grid-cols-[2rem_4.5rem_4rem_14.75rem_6.5rem_minmax(8rem,1fr)_2rem] wider:gap-x-[clamp(1rem,calc(1rem+(100cqi-52.5rem)/8),2rem)]"

// The cartons of a shipment, a row per carton configuration (A1–A10), each opening onto its products. From 44rem the
// rows are a table; narrower, each is a card.
export function CartonTable({
  cartons,
  rowKeys,
  products,
  issues = [],
  remainingPieces,
  context,
  readOnly = false,
  showErrors = false,
  renderNote,
  onChange,
  onDuplicate,
  onDelete
}: {
  cartons: CartonGroup[]
  // Stable keys for the rows, such as the form's field IDs, so each row keeps whether it's open.
  rowKeys?: string[]
  products: OrderInput["items"]
  // The packing rules the cartons break, as validatePacking reports them.
  issues?: ValidationIssue[]
  // Each product's units still to pack, for adding products.
  remainingPieces?: Record<string, number>
  context?: string
  readOnly?: boolean
  // Whether blank fields are errors yet: after submitting, or for cartons saved before.
  showErrors?: boolean | ((cartonIds: string[]) => boolean)
  // Beneath a row, given its carton IDs, such as the Amazon label each carton carries.
  renderNote?: (cartonIds: string[]) => React.ReactNode
  onChange?: (index: number, value: CartonGroup) => void
  onDuplicate?: (index: number) => void
  onDelete?: (index: number) => void
}) {
  const t = useTranslations("orders.cartonEditor")
  const cartonIds = groupCartonIds(cartons)
  return (
    <div className="@container/packing">
      <div className="flex flex-col gap-3 wide:gap-0 wide:overflow-hidden wide:rounded-lg wide:border wide:bg-card">
        <div
          aria-hidden
          className={cn("hidden bg-muted/60 px-4 py-2.5 text-[13px] text-muted-foreground wide:grid", columns)}
        >
          <span className="col-start-2">{t("columns.cartons")}</span>
          <span className={readOnly ? undefined : "text-end"}>{t("columns.count")}</span>
          <span>{t("columns.dimensions")}</span>
          <span>{t("columns.weight")}</span>
          <span>{t("columns.contents")}</span>
        </div>
        {cartons.map((value, index) => {
          const ids = cartonIds[index]!
          return (
            <CartonRow
              key={rowKeys?.[index] ?? index}
              value={value}
              ids={ids}
              products={products}
              issues={issues.filter((issue) => issue.cartonId && ids.includes(issue.cartonId))}
              remainingPieces={remainingPieces}
              context={context}
              readOnly={readOnly}
              showErrors={typeof showErrors === "function" ? showErrors(ids) : showErrors}
              note={renderNote?.(ids)}
              onChange={(next) => onChange?.(index, next)}
              onDuplicate={() => onDuplicate?.(index)}
              onDelete={() => onDelete?.(index)}
            />
          )
        })}
      </div>
    </div>
  )
}

function CartonRow({
  value,
  ids,
  products,
  issues,
  remainingPieces,
  context,
  readOnly,
  showErrors,
  note,
  onChange,
  onDuplicate,
  onDelete
}: {
  value: CartonGroup
  // The row's physical cartons.
  ids: string[]
  products: OrderInput["items"]
  issues: ValidationIssue[]
  remainingPieces?: Record<string, number>
  context?: string
  readOnly: boolean
  showErrors: boolean
  note?: React.ReactNode
  onChange: (value: CartonGroup) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const t = useTranslations("orders.cartonEditor")
  const issueErrors = useCartonIssueErrors()
  const packing = useTranslations("orders.packing")
  const format = useFormatter()
  const measure = useMeasure()
  const id = useId()
  const [touched, setTouched] = useState<string[]>([])
  const touch = (field: string) => setTouched((current) => (current.includes(field) ? current : [...current, field]))
  const update = (patch: Partial<CartonGroup>) => onChange({ ...value, ...patch })
  // Fields and menus name the group by its first carton, as they always have; the row shows all its cartons.
  const title = t("carton", { carton: value.cartonId })
  const grouped = ids.length > 1
  const label = cartonGroupLabel(ids.map((carton) => ({ id: carton })))
  const errors = cartonErrors()
  // Rows with problems open, and so do new ones, to add their products; the rest stay closed until opened. A row opens
  // when it gets a problem too, unless it's been closed by hand.
  const [open, setOpen] = useState(() => !readOnly && (errors.length > 0 || !value.items.length))
  const [toggled, setToggled] = useState(false)
  if (!readOnly && !toggled && !open && errors.length > 0) {
    setOpen(true)
  }
  const count = Number.isInteger(value.count) && value.count > 0 ? value.count : 0
  const perCarton = value.items.reduce((sum, item) => sum + (item.pieces || 0), 0)
  const units = t("unitCount", { count: count * perCarton })
  const detail = value.items.length
    ? t("contentsDetail", { products: value.items.length, perCarton })
    : t("emptyCarton")
  const at = (place: Place) => errors.filter((error) => error.place === place)
  const outlined = (field: string) => errors.some((error) => error.outlines.includes(field))
  // A field names its errors only while they're on screen: a closed row hides them.
  const errorsId = (place: Place) => `${id}-${place}`
  const errorId = (place: Place) => (open && at(place).length > 0 ? errorsId(place) : undefined)

  function cartonErrors() {
    const found: CartonError[] = issueErrors(issues, value, products)
    // Blank or impossible numbers, once they've been entered, left or submitted.
    const shown = (field: string, number: number) => showErrors || touched.includes(field) || Number.isFinite(number)
    const positive = (number: number) => Number.isFinite(number) && number > 0
    if (shown("count", value.count) && !(Number.isInteger(value.count) && value.count > 0 && value.count <= 1000)) {
      found.push({ place: "count", outlines: ["count"], message: t("enterCount") })
    }
    const blankSides = (["length", "width", "height"] as const).filter(
      (side) => shown(side, value[side]) && !positive(value[side])
    )
    if (blankSides.length) {
      found.push({ place: "dimensions", outlines: blankSides, message: t("enterDimensions") })
    }
    if (shown("weight", value.weight) && !positive(value.weight)) {
      found.push({ place: "weight", outlines: ["weight"], message: t("enterWeight") })
    }
    for (const [index, content] of value.items.entries()) {
      const field = `items.${index}`
      const product = products.find((item) => item.id === content.itemId)
      const pack = product?.piecesPerSet ?? 1
      if (shown(field, content.pieces) && !(Number.isInteger(content.pieces) && content.pieces > 0)) {
        found.push({ place: index, outlines: [field], message: t("enterUnits") })
      } else if (Number.isFinite(content.pieces) && content.pieces % pack !== 0) {
        found.push({
          place: index,
          outlines: [field],
          message: t("rules.incompletePacks", { pack, sku: product?.buyerSku ?? "" })
        })
      }
    }
    if (showErrors && !value.items.length) {
      found.push({ place: "carton", outlines: [], message: t("addProductRequired") })
    }
    // A group's cartons break the same rules, so each shows once.
    return found.filter(
      (error, index) =>
        found.findIndex((other) => other.message === error.message && other.place === error.place) === index
    )
  }

  const errorLines = (place: Place, className: string) =>
    open &&
    at(place).length > 0 && (
      <div id={errorsId(place)} aria-live="polite" className={cn("flex flex-col gap-2", className)}>
        {at(place).map((error) => (
          <FieldError key={error.message} source={error.source}>
            {error.message}
          </FieldError>
        ))}
      </div>
    )
  // Captions and field labels, as 06.27 to 06.30 set them: 12px medium, a shade darker than muted text.
  const caption = "text-xs font-medium text-neutral-600 dark:text-neutral-400"
  const sides = { length: value.length, width: value.width, height: value.height }

  return (
    <section
      aria-label={title}
      className={cn(
        "overflow-hidden rounded-lg border bg-card wide:grid wide:overflow-visible wide:rounded-none wide:border-0 wide:border-t wide:bg-transparent wide:px-4",
        columns
      )}
    >
      {/* The row's head: on a card its own line, in the table its first cells. */}
      <div className="flex items-start gap-2.5 p-3.5 wide:contents">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-ms-1 shrink-0 text-muted-foreground wide:col-start-1 wide:row-start-1 wide:ms-0 wide:self-center"
          aria-expanded={open}
          aria-controls={`${id}-products`}
          aria-label={t("toggleProducts", { cartons: label })}
          onClick={() => {
            setOpen(!open)
            setToggled(true)
          }}
        >
          <ChevronRight className={cn("transition-transform rtl:rotate-180", open && "rotate-90 rtl:rotate-90")} />
        </Button>
        <div className="min-w-0 flex-1 wide:col-start-2 wide:row-start-1 wide:self-center wide:py-3.5">
          <h3 className="font-semibold [overflow-wrap:anywhere]">{label}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground wide:hidden">{t("contentsSummary", { units, detail })}</p>
        </div>
        {!open && errors.length > 0 && <IssueBadge count={errors.length} className="mt-0.5 wide:hidden" />}
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="-me-1 shrink-0 wide:col-start-7 wide:row-start-1 wide:me-0 wide:self-center"
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
      {/* The carton's numbers: labelled fields on a card, the row's cells in the table. Read-only, they're text on one
          line. */}
      {readOnly ? (
        <dl className="flex flex-wrap gap-x-3 gap-y-2 px-3.5 pb-3.5 wide:contents">
          {(
            [
              ["count", format.number(value.count), "min-w-14 wide:col-start-3"],
              ["dimensions", measure.dimensions(sides), "min-w-34 wide:col-start-4"],
              ["weight", measure.weight(value.weight), "wide:col-start-5"]
            ] as const
          ).map(([field, text, place]) => (
            <div key={field} className={cn("flex flex-col gap-1 wide:row-start-1 wide:self-center", place)}>
              <dt className={cn(caption, "wide:sr-only")}>{t(`columns.${field}`)}</dt>
              <dd className="tabular-nums">{text}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-6 gap-y-3 px-3.5 pb-3.5 wide:contents">
          <div className="flex flex-col gap-1.5 wide:contents">
            <span aria-hidden className={cn(caption, "wide:hidden")}>
              {t("columns.count")}
            </span>
            <NumberField
              label={`${title}: ${t("columns.count")}`}
              value={value.count}
              onChange={(next) => update({ count: next })}
              onBlur={() => touch("count")}
              invalid={outlined("count")}
              integer
              errorId={errorId("count")}
              className="wide:col-start-3 wide:row-start-1 wide:self-center"
            />
            {errorLines("count", "wide:col-[2/-1] wide:row-start-3 wide:pb-2")}
          </div>
          <div className="flex flex-col gap-1.5 wide:contents">
            <span aria-hidden className={cn(caption, "wide:hidden")}>
              {t("columns.weight")}
            </span>
            <NumberField
              label={`${title}: ${packing("dimensions.weight")}`}
              suffix="kg"
              value={value.weight}
              onChange={(weight) => update({ weight })}
              onBlur={() => touch("weight")}
              invalid={outlined("weight")}
              errorId={errorId("weight")}
              className="wide:col-start-5 wide:row-start-1 wide:self-center"
            />
            {errorLines("weight", "wide:col-[2/-1] wide:row-start-5 wide:pb-2")}
          </div>
          <div className="col-span-2 flex flex-col gap-1.5 wide:contents">
            <span aria-hidden className={cn(caption, "wide:hidden")}>
              {t("columns.dimensions")}
            </span>
            <DimensionsField
              label={(side) => `${title}: ${packing(`dimensions.${side}`)}`}
              value={sides}
              onChange={update}
              onBlur={touch}
              invalid={(["length", "width", "height"] as const).filter(outlined)}
              errorId={errorId("dimensions")}
              className="wide:col-start-4 wide:row-start-1 wide:self-center"
            />
            {errorLines("dimensions", "wide:col-[2/-1] wide:row-start-4 wide:pb-2")}
          </div>
          {errorLines("carton", "col-span-2 wide:col-[2/-1] wide:row-start-2 wide:pb-2")}
        </div>
      )}
      {/* What the row holds, and on a closed row its issues by the menu, under the summary when there's no room. */}
      <div className="hidden wide:col-start-6 wide:row-start-1 wide:flex wide:flex-wrap wide:items-center wide:justify-between wide:gap-x-3 wide:gap-y-1 wide:self-center wide:py-3.5">
        <div>
          <p className="tabular-nums">{units}</p>
          <p className="text-[13px] text-muted-foreground">{detail}</p>
        </div>
        {!open && errors.length > 0 && <IssueBadge count={errors.length} />}
      </div>
      {note && <div className="px-3.5 pb-3.5 wide:col-[2/-1] wide:row-start-6 wide:px-0">{note}</div>}
      {open && (
        // In the table the band reaches the row's edges and shares its columns: a product spans cartons to dimensions,
        // its supplier SKU sits under weight and its quantity under contents.
        <div
          id={`${id}-products`}
          className={cn(
            "border-t bg-muted/30 wide:col-span-full wide:row-start-7 wide:-mx-4 wide:grid wide:grid-cols-subgrid wide:px-4",
            errors.some((error) => typeof error.place === "string") && "wide:mt-1.5"
          )}
        >
          {value.items.map((content, index) => {
            const item = products.find((product) => product.id === content.itemId)
            if (!item) {
              return null
            }
            const field = `items.${index}`
            const first = index === 0
            const multipack = item.piecesPerSet > 1 && Number.isInteger(content.pieces / item.piecesPerSet)
            return (
              <div
                key={content.itemId}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-3 px-3.5 py-3 wide:col-[2/-1] wide:grid-cols-subgrid wide:px-0 wide:py-3.5 wide:[column-gap:normal]",
                  !first && "border-t"
                )}
              >
                <div className="col-span-3 min-w-0 [overflow-wrap:anywhere]">
                  {first && <p className={cn(caption, "mb-2 hidden wide:block")}>{packing("product")}</p>}
                  <p className="font-medium">{item.name}</p>
                  {item.variant && item.variant !== "Default Title" && (
                    <p className="mt-0.5 text-[13px] text-muted-foreground">{item.variant}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className={cn(caption, "mb-1.5", !first && "wide:hidden")}>{packing("supplierSku")}</p>
                  <p className={cn("break-all", !readOnly && "py-2")}>{item.supplierSku || "—"}</p>
                </div>
                <div className="min-w-0 wide:max-w-32">
                  <p className={cn(caption, "mb-1.5", !first && "wide:hidden")}>{t("quantityPerCarton")}</p>
                  {readOnly ? (
                    <p className="tabular-nums">{t("unitCount", { count: content.pieces })}</p>
                  ) : (
                    <NumberField
                      label={t("productQuantity", { sku: item.buyerSku, carton: value.cartonId })}
                      suffix={t("units")}
                      value={content.pieces}
                      onChange={(pieces) =>
                        update({ items: value.items.map((row, i) => (i === index ? { ...row, pieces } : row)) })
                      }
                      onBlur={() => touch(field)}
                      invalid={outlined(field)}
                      integer
                      errorId={errorId(index)}
                    />
                  )}
                  {multipack && (
                    <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                      {t("packsOf", { packs: content.pieces / item.piecesPerSet, size: item.piecesPerSet })}
                    </p>
                  )}
                </div>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "mt-[1.375rem] size-9 text-muted-foreground wide:col-start-6 wide:justify-self-end",
                      !first && "wide:mt-0"
                    )}
                    aria-label={t("removeProduct", { sku: item.buyerSku, carton: value.cartonId })}
                    onClick={() => update({ items: value.items.filter((_, i) => i !== index) })}
                  >
                    <Trash2 />
                  </Button>
                )}
                {errorLines(index, "col-span-full")}
              </div>
            )
          })}
          {!value.items.length && readOnly && (
            <p className="px-3.5 py-3 text-muted-foreground wide:col-[2/-1] wide:px-0">{t("emptyCarton")}</p>
          )}
          {!readOnly && (
            <div
              className={cn("px-3.5 py-3 wide:col-[2/-1] wide:px-0 wide:py-3.5", value.items.length > 0 && "border-t")}
            >
              <CartonProductsDialog
                label={
                  grouped
                    ? t("addProductsToCartons", { cartons: label })
                    : t("addProductsTo", { carton: value.cartonId })
                }
                added={value.items.map((item) => item.itemId)}
                products={products}
                context={context}
                remainingPieces={
                  remainingPieces ??
                  Object.fromEntries(
                    products.map((item) => [
                      item.id,
                      item.pieces -
                        (value.items.find((content) => content.itemId === item.id)?.pieces || 0) * (count || 1)
                    ])
                  )
                }
                onAdd={(added) =>
                  update({
                    items: [
                      ...value.items,
                      ...added
                        .filter((itemId) => !value.items.some((item) => item.itemId === itemId))
                        .map((itemId) => ({ itemId, pieces: Number.NaN }))
                    ]
                  })
                }
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
