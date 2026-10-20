import { cartonList, cartonRunLabel, cartonRuns, type ValidationIssue } from "@repo/aisle"
import { ChevronRight, Copy, Ellipsis, Trash2, X } from "lucide-react"
import { useId, useState } from "react"
import { useTranslations } from "use-intl"
import { nextPalletId, type PalletCarton, type PalletValue } from "@/lib/carton-groups"
import { cn } from "@/lib/utils"
import { DimensionsField, FieldError, IssueBadge, NumberField, useMeasure } from "./packing-fields"
import { PalletCartonsDialog } from "./pallet-cartons-dialog"
import { Button } from "./ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

// Toggle, pallet, dimensions, weight, stacking, cartons and the menu, at every width.
const columns = "wide:grid-cols-[1.75rem_4rem_14.75rem_6rem_8.25rem_minmax(0,1fr)_2rem]"

// The pallets a shipment's cartons are packed on, a row per pallet opening onto its cartons. From 50rem the rows are a
// table; narrower, each is a card.
export function PalletTable({
  pallets,
  cartons,
  issues = [],
  context,
  readOnly = false,
  showErrors = false,
  onChange
}: {
  pallets: PalletValue[]
  // The shipment's cartons, in packing list order.
  cartons: PalletCarton[]
  // The pallet rules the packing breaks, as validatePacking reports them.
  issues?: ValidationIssue[]
  context?: string
  readOnly?: boolean
  showErrors?: boolean
  onChange?: (pallets: PalletValue[]) => void
}) {
  const t = useTranslations("orders.pallets")
  const update = (index: number, next: PalletValue) =>
    onChange?.(pallets.map((pallet, i) => (i === index ? next : pallet)))
  return (
    <div className="@container/packing">
      <div className="flex flex-col gap-3 wide:gap-0 wide:overflow-hidden wide:rounded-lg wide:border wide:bg-card">
        <div
          aria-hidden
          className={cn("hidden gap-x-5 bg-muted/60 px-4 py-2.5 text-[13px] text-muted-foreground wide:grid", columns)}
        >
          <span className="col-start-2">{t("columns.pallet")}</span>
          <span>{t("columns.dimensions")}</span>
          <span>{t("columns.weight")}</span>
          <span>{t("columns.stacking")}</span>
          <span>{t("columns.cartons")}</span>
        </div>
        {pallets.map((pallet, index) => (
          <PalletRow
            key={pallet.palletId}
            value={pallet}
            pallets={pallets}
            cartons={cartons}
            issues={issues.filter((issue) => issue.palletId === pallet.palletId)}
            context={context}
            readOnly={readOnly}
            showErrors={showErrors}
            onChange={(next) => update(index, next)}
            onChooseCartons={(cartonIds) =>
              // A carton chosen here leaves any other pallet it was on.
              onChange?.(
                pallets.map((other, i) =>
                  i === index
                    ? { ...other, cartonIds }
                    : { ...other, cartonIds: other.cartonIds.filter((id) => !cartonIds.includes(id)) }
                )
              )
            }
            onDuplicate={() =>
              onChange?.([...pallets, { ...structuredClone(pallet), palletId: nextPalletId(pallets), cartonIds: [] }])
            }
            onDelete={() => onChange?.(pallets.filter((_, i) => i !== index))}
          />
        ))}
      </div>
    </div>
  )
}

function PalletRow({
  value,
  pallets,
  cartons,
  issues,
  context,
  readOnly,
  showErrors,
  onChange,
  onChooseCartons,
  onDuplicate,
  onDelete
}: {
  value: PalletValue
  pallets: PalletValue[]
  cartons: PalletCarton[]
  issues: ValidationIssue[]
  context?: string
  readOnly: boolean
  showErrors: boolean
  onChange: (value: PalletValue) => void
  onChooseCartons: (cartonIds: string[]) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const t = useTranslations("orders.pallets")
  const units = useTranslations("orders.cartonEditor")
  const rules = useTranslations("server.readiness.packing")
  const packing = useTranslations("orders.packing")
  const measure = useMeasure()
  const id = useId()
  const [touched, setTouched] = useState<string[]>([])
  const touch = (field: string) => setTouched((current) => (current.includes(field) ? current : [...current, field]))
  const name = t("name", { pallet: value.palletId })
  // Only the shipment's cartons, in packing list order, so the tags read as runs.
  const onPallet = cartons.filter((carton) => value.cartonIds.includes(carton.id))
  const sides = { length: value.length, width: value.width, height: value.height }
  const shown = (field: string, number: number) => showErrors || touched.includes(field) || Number.isFinite(number)
  const positive = (number: number) => Number.isFinite(number) && number > 0
  const blankSides = (["length", "width", "height"] as const).filter(
    (side) => shown(side, value[side]) && !positive(value[side])
  )
  const errors = {
    dimensions: blankSides.length ? [t("enterDimensions")] : [],
    weight: shown("weight", value.weight) && !positive(value.weight) ? [t("enterWeight")] : [],
    // A new pallet has no cartons until they're chosen, so that waits for submitting.
    pallet: issues
      .filter((issue) => issue.code !== "emptyPallet" || showErrors)
      .map((issue) => ("values" in issue ? rules(issue.code, issue.values) : rules(issue.code)))
  }
  const count = errors.dimensions.length + errors.weight.length + errors.pallet.length
  // Like a carton row, a pallet opens when it has problems or no cartons, and when it gets a problem unless closed by hand.
  const [open, setOpen] = useState(() => !readOnly && (count > 0 || !value.cartonIds.length))
  const [toggled, setToggled] = useState(false)
  if (!readOnly && !toggled && !open && count > 0) {
    setOpen(true)
  }
  const summary = {
    cartons: t("cartonCount", { count: onPallet.length }),
    units: units("unitCount", { count: onPallet.reduce((sum, carton) => sum + carton.units, 0) })
  }
  const errorLines = (place: keyof typeof errors, className: string) =>
    open &&
    errors[place].length > 0 && (
      <div id={`${id}-${place}`} aria-live="polite" className={cn("flex flex-col gap-2", className)}>
        {errors[place].map((message) => (
          <FieldError key={message}>{message}</FieldError>
        ))}
      </div>
    )
  const caption = "text-xs text-muted-foreground"
  const stacking = (stackable: boolean) => t(stackable ? "stackable" : "notStackable")

  return (
    <section
      aria-label={name}
      className={cn(
        "overflow-hidden rounded-lg border bg-card wide:grid wide:gap-x-5 wide:overflow-visible wide:rounded-none wide:border-0 wide:border-t wide:bg-transparent wide:px-4",
        columns
      )}
    >
      <div className="flex items-start gap-2.5 p-3.5 wide:contents">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-ms-1 shrink-0 text-muted-foreground wide:col-start-1 wide:row-start-1 wide:ms-0 wide:self-center"
          aria-expanded={open}
          aria-controls={`${id}-cartons`}
          aria-label={t("toggleCartons", { pallet: name })}
          onClick={() => {
            setOpen(!open)
            setToggled(true)
          }}
        >
          <ChevronRight className={cn("transition-transform rtl:rotate-180", open && "rotate-90 rtl:rotate-90")} />
        </Button>
        <div className="min-w-0 flex-1 wide:col-start-2 wide:row-start-1 wide:self-center wide:py-3.5">
          <h3 className="font-semibold whitespace-nowrap">{name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground wide:hidden">{t("summary", summary)}</p>
        </div>
        {!open && count > 0 && <IssueBadge count={count} className="mt-0.5 wide:hidden" />}
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="-me-1 shrink-0 wide:col-start-7 wide:row-start-1 wide:me-0 wide:self-center"
                  aria-label={t("actions", { pallet: name })}
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
      {readOnly ? (
        // On a card, one line that wraps for longer words, such as German's "Nicht stapelbar".
        <dl className="flex flex-wrap gap-x-3 gap-y-2 px-3.5 pb-3.5 wide:contents">
          {(
            [
              ["dimensions", measure.dimensions(sides), "min-w-32 wide:col-start-3"],
              ["weight", measure.weight(value.weight), "min-w-14 wide:col-start-4"],
              ["stacking", stacking(value.stackable), "wide:col-start-5"]
            ] as const
          ).map(([field, text, place]) => (
            <div key={field} className={cn("flex flex-col gap-1 wide:row-start-1 wide:self-center", place)}>
              <dt className={cn(caption, "wide:sr-only")}>{t(`columns.${field}`)}</dt>
              <dd className="tabular-nums">{text}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-3 px-3.5 pb-3.5 wide:contents">
          <div className="col-span-2 flex flex-col gap-1.5 wide:contents">
            <span aria-hidden className={cn(caption, "wide:hidden")}>
              {t("columns.dimensions")}
            </span>
            <DimensionsField
              label={(side) => `${name}: ${packing(`dimensions.${side}`)}`}
              value={sides}
              onChange={(patch) => onChange({ ...value, ...patch })}
              onBlur={touch}
              invalid={blankSides}
              errorId={`${id}-dimensions`}
              className="wide:col-start-3 wide:row-start-1 wide:self-center"
            />
            {errorLines("dimensions", "wide:col-[2/-1] wide:row-start-3 wide:pb-2")}
          </div>
          <div className="flex flex-col gap-1.5 wide:contents">
            <span aria-hidden className={cn(caption, "wide:hidden")}>
              {t("columns.weight")}
            </span>
            <NumberField
              label={`${name}: ${packing("dimensions.weight")}`}
              suffix="kg"
              value={value.weight}
              onChange={(weight) => onChange({ ...value, weight })}
              onBlur={() => touch("weight")}
              invalid={errors.weight.length > 0}
              errorId={`${id}-weight`}
              className="wide:col-start-4 wide:row-start-1 wide:self-center"
            />
            {errorLines("weight", "wide:col-[2/-1] wide:row-start-4 wide:pb-2")}
          </div>
          <div className="flex flex-col gap-1.5 wide:contents">
            <span aria-hidden className={cn(caption, "wide:hidden")}>
              {t("columns.stacking")}
            </span>
            <Select
              items={[true, false].map((stackable) => ({ value: stackable, label: stacking(stackable) }))}
              value={value.stackable}
              onValueChange={(stackable) => onChange({ ...value, stackable: stackable ?? true })}
            >
              <SelectTrigger
                aria-label={`${name}: ${t("columns.stacking")}`}
                className="h-11 w-full bg-background sm:h-9 wide:col-start-5 wide:row-start-1 wide:self-center"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[true, false].map((stackable) => (
                  <SelectItem key={String(stackable)} value={stackable}>
                    {stacking(stackable)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {errorLines("pallet", "col-span-2 wide:col-[2/-1] wide:row-start-2 wide:pb-2")}
        </div>
      )}
      <div className="hidden wide:col-start-6 wide:row-start-1 wide:block wide:self-center wide:py-3.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
          {summary.cartons}
          {!open && count > 0 && <IssueBadge count={count} />}
        </p>
        <p className="text-[13px] text-muted-foreground tabular-nums">{summary.units}</p>
      </div>
      {open && (
        <div
          id={`${id}-cartons`}
          className={cn(
            "border-t bg-muted/30 px-3.5 py-3 wide:col-span-full wide:row-start-5 wide:-mx-4 wide:py-3.5 wide:ps-16 wide:pe-4",
            count > 0 && "wide:mt-1.5"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <p className={caption}>{t("cartonsOnPallet")}</p>
            {!readOnly && (
              <PalletCartonsDialog
                pallet={value}
                pallets={pallets}
                cartons={cartons}
                context={context}
                onSave={onChooseCartons}
              />
            )}
          </div>
          {readOnly ? (
            <p className="mt-1.5">{onPallet.length ? cartonList(onPallet.map((carton) => carton.id)) : "—"}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label={t("cartonsOnPallet")}>
              {cartonRuns(onPallet.map((carton) => carton.id)).map((run) => (
                <li
                  key={run[0]}
                  className="flex h-8 items-center gap-1 rounded-md border bg-background ps-2.5 pe-1 text-sm tabular-nums"
                >
                  {cartonRunLabel(run)}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={t("removeCartons", { cartons: cartonRunLabel(run), pallet: name })}
                    onClick={() =>
                      onChange({ ...value, cartonIds: value.cartonIds.filter((carton) => !run.includes(carton)) })
                    }
                  >
                    <X />
                  </Button>
                </li>
              ))}
              {!onPallet.length && <li className="text-sm text-muted-foreground">{t("noCartons")}</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
