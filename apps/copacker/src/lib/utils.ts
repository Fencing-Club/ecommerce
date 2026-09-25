import { type ClassValue, clsx } from "clsx"

// Joins class names. vanilla-extract styles don't conflict the way utility classes did, so no merging is needed.
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
