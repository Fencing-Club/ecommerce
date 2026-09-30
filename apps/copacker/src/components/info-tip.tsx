import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// A short explanation behind an info icon, for the few things a card can't show on its face. The kit's tooltip: a dark
// bubble up to 260px wide.
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] rounded-md px-2.5 py-2 leading-[1.45] shadow-[0_4px_12px_rgb(15_15_15/0.16)]">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
