import { Input, InputGroupInput } from "@buildkitgg/shadcn"
import { cn } from "@/lib/utils"

// A number without the browser's up and down buttons, which crowd a short field, its digits lined up.
const number =
  "tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"

export function NumberInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  return <Input type="number" className={cn(number, className)} {...props} />
}

// A NumberInput inside an InputGroup, such as a quantity with its unit after it.
export function InputGroupNumberInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof InputGroupInput>, "type">) {
  return <InputGroupInput type="number" className={cn(number, className)} {...props} />
}
