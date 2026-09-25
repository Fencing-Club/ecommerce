import { Input as InputPrimitive } from "@base-ui/react/input"
import * as React from "react"
import { cn } from "@/lib/utils"
import * as styles from "./input.css"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <InputPrimitive type={type} data-slot="input" className={cn(styles.input, className)} {...props} />
}

export { Input }
