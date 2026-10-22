import { ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"

// A product's photo, or a placeholder in the same frame so rows line up. The frame is 40px unless `className` sizes it,
// such as `size-9` in a list or `size-8` beside a variation, and the whole photo fits inside it. The photo is
// decorative: the product's name is beside it.
export function ProductThumb({ url, className }: { url: string | null | undefined; className?: string }) {
  const frame = cn(
    "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground",
    className
  )
  if (!url) {
    return (
      <span aria-hidden className={frame}>
        <ImageOff className="size-4" />
      </span>
    )
  }
  return (
    <span className={frame}>
      <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
    </span>
  )
}
