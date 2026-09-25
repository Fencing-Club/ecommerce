import { cn } from "@/lib/utils"
import * as styles from "./skeleton.css"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn(styles.skeleton, className)} {...props} />
}

export { Skeleton }
