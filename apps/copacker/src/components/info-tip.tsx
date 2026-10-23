import { Tooltip, TooltipContent, TooltipTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { Info } from "lucide-react"

// A short explanation behind an info icon, for the few things a card can't show on its face. The kit's tooltip: a dark
// bubble up to 260px wide.
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        className="focus-ring inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] rounded-md px-2.5 py-2 leading-[1.45]">{children}</TooltipContent>
    </Tooltip>
  )
}
