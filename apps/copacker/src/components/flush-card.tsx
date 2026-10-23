import { Card } from "@buildkitgg/shadcn-baseui-kit"
import { cn } from "@/lib/utils"

// A card whose content runs edge to edge, such as a table or a list: no gap or padding of its own, and a header (a
// direct CardHeader) keeps the card's padding, with a rule under it whenever something follows it.
export function FlushCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return (
    <Card
      data-flush=""
      className={cn(
        "gap-0 py-0 *:data-[slot=card-header]:py-(--card-spacing) *:data-[slot=card-header]:not-last:border-b",
        className
      )}
      {...props}
    />
  )
}
