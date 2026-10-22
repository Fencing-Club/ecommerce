import { Search } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

// A list's search box, with a magnifier before what's typed. `label` names it for screen readers, and is its
// placeholder unless `placeholder` says more. `ref` and `onKeyDown` reach the input, such as to focus it when it opens
// or to search on Enter.
export function SearchField({
  label,
  placeholder = label,
  value,
  onChange,
  maxLength,
  className,
  ref,
  onKeyDown
}: {
  label: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  maxLength?: number
  className?: string
} & Pick<React.ComponentProps<typeof InputGroupInput>, "ref" | "onKeyDown">) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        ref={ref}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </InputGroup>
  )
}
