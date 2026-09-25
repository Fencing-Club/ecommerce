import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cn } from "@/lib/utils"
import { button, type ButtonVariants } from "./button.css"

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & ButtonVariants) {
  return <ButtonPrimitive data-slot="button" className={cn(button({ variant, size }), className)} {...props} />
}

export { Button }
