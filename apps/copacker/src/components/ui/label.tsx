"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import * as styles from "./label.css"

function Label({ className, htmlFor, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" htmlFor={htmlFor} className={cn(styles.label, className)} {...props} />
}

export { Label }
