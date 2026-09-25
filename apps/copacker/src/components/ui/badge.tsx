import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "@/lib/utils"
import { badge, type BadgeVariants } from "./badge.css"

function Badge({ className, variant = "default", render, ...props }: useRender.ComponentProps<"span"> & BadgeVariants) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badge({ variant }), className)
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant
    }
  })
}

export { Badge }
