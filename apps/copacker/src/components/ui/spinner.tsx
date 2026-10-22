import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

// The kit's busy mark. It turns unless the person asks for reduced motion, and it's decoration: whatever it sits in
// says what's loading.
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      aria-hidden="true"
      className={cn("size-4 motion-safe:animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
