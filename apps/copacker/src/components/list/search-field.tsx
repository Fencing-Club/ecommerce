import { Search } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

// A list's search box, with a magnifier before what's typed. `label` names it for screen readers, and is its
// placeholder unless `placeholder` says more.
export function SearchField({
  label,
  placeholder = label,
  value,
  onChange,
  maxLength,
  className
}: {
  label: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  maxLength?: number
  className?: string
}) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={label}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </InputGroup>
  )
}
