import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@buildkitgg/shadcn-baseui-kit"

// One choice, and what the menu says about it under its label.
export type SelectOption<T extends string> = { value: T; label: string; description?: string }

// A select of set choices, typed by their values, for a control that isn't bound to a form: a sort, a filter, or a
// setting saved as it changes. A React Hook Form field is a FormSelect. Choosing calls `onValueChange` with the option's
// own value, so a caller never casts it, as SelectField and Base UI's Select name it.
export function OptionSelect<T extends string>({
  options,
  value,
  onValueChange,
  label,
  labelledBy,
  id,
  placeholder,
  icon,
  disabled,
  size,
  className
}: {
  options: ReadonlyArray<SelectOption<T>>
  // Null shows the placeholder.
  value: T | null
  onValueChange: (value: T) => void
  // Names the select for screen readers when no label beside it does.
  label?: string
  // The id of a label beside it, such as "Rows per page".
  labelledBy?: string
  // For a field label's htmlFor.
  id?: string
  placeholder?: string
  // Before the value, such as a sort's arrows.
  icon?: React.ReactNode
  disabled?: boolean
  size?: "sm" | "default"
  // The trigger's width and the like.
  className?: string
}) {
  return (
    <Select<T>
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) {
          onValueChange(next)
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} aria-label={label} aria-labelledby={labelledBy} className={className}>
        {icon}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.description ? (
                <span className="flex flex-col">
                  {option.label}
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </span>
              ) : (
                option.label
              )}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
