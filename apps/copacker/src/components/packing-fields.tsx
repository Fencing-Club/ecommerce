import { Badge, InputGroup, InputGroupAddon } from "@buildkitgg/shadcn-baseui-kit"
import { CircleAlert, ExternalLink } from "lucide-react"
import { useFormatter, useTranslations } from "use-intl"
import { InputGroupNumberInput } from "@/components/number-input"
import { cn } from "@/lib/utils"

// A carton or pallet number: blank until entered, with its unit after it.
export function NumberField({
  label,
  suffix,
  value,
  onChange,
  onBlur,
  invalid,
  integer = false,
  className,
  errorId
}: {
  label: string
  suffix?: string
  value: number
  onChange: (value: number) => void
  onBlur?: () => void
  invalid?: boolean
  integer?: boolean
  className?: string
  errorId?: string
}) {
  return (
    <InputGroup className={cn("h-9 bg-background", className)}>
      <InputGroupNumberInput
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        inputMode={integer ? "numeric" : "decimal"}
        min={0}
        step={integer ? 1 : "any"}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        onBlur={onBlur}
        className="h-full min-w-0 text-end"
      />
      {suffix && (
        <InputGroupAddon align="inline-end" className="text-xs font-normal">
          {suffix}
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

export type Dimensions = { length: number; width: number; height: number }

// Length, width and height in one field, as a packing list writes them: L × W × H in centimetres. In a table narrower
// than the design's, the column heading names the field and the L × W × H hint makes way for the numbers.
export function DimensionsField({
  label,
  value,
  onChange,
  onBlur,
  invalid = [],
  errorId,
  className
}: {
  // Each side's name, such as "Carton A1: Length (cm)".
  label: (side: keyof Dimensions) => string
  value: Dimensions
  onChange: (value: Partial<Dimensions>) => void
  onBlur?: (side: keyof Dimensions) => void
  invalid?: (keyof Dimensions)[]
  errorId?: string
  className?: string
}) {
  const t = useTranslations("orders.cartonEditor")
  const sides = ["length", "width", "height"] as const
  return (
    <InputGroup className={cn("h-9 bg-background", className)}>
      <InputGroupAddon className="text-xs font-normal whitespace-nowrap wide:hidden wider:flex" aria-hidden>
        {sides.map((side) => t(`axis.${side}`)).join(" × ")}
      </InputGroupAddon>
      <div className="ms-auto flex h-full min-w-0 items-center wide:ms-0 wide:flex-1">
        {sides.map((side, index) => (
          <span key={side} className="flex h-full min-w-0 items-center wide:flex-1">
            {index > 0 && (
              <span aria-hidden className="text-xs text-muted-foreground">
                ×
              </span>
            )}
            <InputGroupNumberInput
              aria-label={label(side)}
              aria-invalid={invalid.includes(side) || undefined}
              aria-describedby={invalid.includes(side) ? errorId : undefined}
              inputMode="decimal"
              min={0}
              step="any"
              value={Number.isFinite(value[side]) ? value[side] : ""}
              onChange={(event) => onChange({ [side]: event.currentTarget.valueAsNumber })}
              onBlur={() => onBlur?.(side)}
              className="h-full w-11 min-w-0 px-1.5 text-center wide:w-auto wide:flex-1"
            />
          </span>
        ))}
      </div>
      <InputGroupAddon align="inline-end" className="text-xs font-normal">
        cm
      </InputGroupAddon>
    </InputGroup>
  )
}

// A read-only number with its unit, or a dash while it's blank.
export function useMeasure() {
  const format = useFormatter()
  const number = (value: number) => (Number.isFinite(value) ? format.number(value) : "—")
  return {
    number,
    dimensions: (value: Dimensions) =>
      [value.length, value.width, value.height].every(Number.isFinite)
        ? `${[value.length, value.width, value.height].map(number).join(" × ")} cm`
        : "—",
    weight: (value: number) => (Number.isFinite(value) ? `${number(value)} kg` : "—")
  }
}

// How many problems a closed carton or pallet row has, beside its units.
export function IssueBadge({ count, className }: { count: number; className?: string }) {
  const t = useTranslations("orders.cartonEditor")
  return (
    <Badge variant="destructive" className={className}>
      <CircleAlert aria-hidden data-icon="inline-start" />
      {t("issues", { count })}
    </Badge>
  )
}

// One problem with a field, a product or a row, in the field's own words.
export function FieldError({
  children,
  id,
  className,
  source
}: {
  children: React.ReactNode
  id?: string
  className?: string
  // Where the receiver states the rule, linked after the message, such as "FBA requirements".
  source?: RuleSource
}) {
  const t = useTranslations("orders.packing")
  const booking = useTranslations("booking")
  return (
    <p id={id} className={cn("flex items-start gap-2 text-meta text-destructive", className)}>
      <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span>{children}</span>
        {source && (
          <>
            {" "}
            <a
              href={source.href}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex items-center gap-1 rounded-sm whitespace-nowrap text-foreground underline underline-offset-4"
            >
              {t("ruleSource", { receiver: source.receiver })}
              <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
              <span className="sr-only">{booking("newTab")}</span>
            </a>
          </>
        )}
      </span>
    </p>
  )
}

// The page where a receiver states a rule, such as Amazon's help on FBA's box sizes, and who it is.
export type RuleSource = { href: string; receiver: string }
