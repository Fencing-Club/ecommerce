import type { ClassValue } from "clsx"
import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Tailwind's classes plus the app's own from globals.css: the `text-meta` size, and the `focus-ring` and `text-link`
// utilities. Without them a text color passed after `text-meta` or `text-link` would replace it.
const twMerge = extendTailwindMerge<"focus-ring" | "text-link">({
  extend: {
    theme: { text: ["meta"] },
    classGroups: { "focus-ring": ["focus-ring"], "text-link": ["text-link"] }
  }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
