import * as React from "react"
import { cn } from "@/lib/utils"
import * as styles from "./alert.css"

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & styles.AlertVariants) {
  return <div data-slot="alert" role="alert" className={cn(styles.alert({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn(styles.title, className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn(styles.description, className)} {...props} />
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-action" className={cn(styles.action, className)} {...props} />
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
