import { useId } from "react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

export type Option = {
  value: string
  title: React.ReactNode
  // Beside the title, such as Lowest total.
  badge?: React.ReactNode
  description: React.ReactNode
  price: React.ReactNode
}

// One choice among a few, such as where Amazon places a shipment or which carrier takes it: each a radio row with its
// title, a badge for the one worth noticing, a line about it and its price. `aria-label` names the choice.
export function OptionList({
  options,
  value,
  onValueChange,
  "aria-label": label
}: {
  options: Option[]
  value: string | null
  onValueChange: (value: string) => void
  "aria-label": string
}) {
  return (
    <RadioGroup
      data-slot="option-list"
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
      aria-label={label}
      className="shrink-0 gap-0.5 rounded-lg border p-1"
    >
      {options.map((option) => (
        <OptionRow
          key={option.value}
          value={option.value}
          title={option.title}
          badge={option.badge}
          description={option.description}
          end={<span className="text-sm font-medium tabular-nums">{option.price}</span>}
        />
      ))}
    </RadioGroup>
  )
}

// A row of a single-select list: its radio, title and line, and what sits at its end, such as a price or a status. The
// whole row picks it, and the chosen row is shaded. Lives inside a RadioGroup.
export function OptionRow({
  value,
  title,
  badge,
  description,
  end,
  className
}: {
  value: string
  title: React.ReactNode
  badge?: React.ReactNode
  description: React.ReactNode
  end?: React.ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <label
      htmlFor={`${id}-radio`}
      data-slot="option-row"
      className={cn(
        "flex min-h-13.5 cursor-pointer items-center gap-2.5 rounded-md p-2 transition-colors hover:bg-muted/50 has-data-checked:bg-muted",
        className
      )}
    >
      {/* Base UI's radio isn't a labelable element, so it's named by its title and described by the rest. */}
      <RadioGroupItem
        id={`${id}-radio`}
        value={value}
        aria-labelledby={`${id}-title`}
        aria-describedby={[badge && `${id}-badge`, `${id}-description`, end && `${id}-end`].filter(Boolean).join(" ")}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span id={`${id}-title`} className="truncate text-sm font-medium">
            {title}
          </span>
          {badge && (
            <span id={`${id}-badge`} className="flex shrink-0">
              {badge}
            </span>
          )}
        </span>
        <span id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      {end && (
        <span id={`${id}-end`} className="shrink-0">
          {end}
        </span>
      )}
    </label>
  )
}
