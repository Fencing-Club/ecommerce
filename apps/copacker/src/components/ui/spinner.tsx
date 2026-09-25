import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import * as styles from "./spinner.css"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn(styles.spinner, className)}
      {...props}
    />
  )
}

export { Spinner }
