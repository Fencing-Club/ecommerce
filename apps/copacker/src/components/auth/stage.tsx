import { Box } from "lucide-react"
import { cn } from "@/lib/utils"

// The dark panel on the left of sign-in and getting started: a warm glow from the brand orange, a cooler one opposite,
// and a faint grid that fades out. Phones don't show it.
export function Stage({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <aside
      className={cn(
        "relative m-3 hidden min-h-[40rem] overflow-hidden rounded-3xl bg-[oklch(0.17_0.01_55)] text-white ring-1 ring-white/10 lg:flex lg:flex-col",
        className
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(70%_55%_at_15%_0%,oklch(0.65_0.2_45/0.34),transparent_70%),radial-gradient(60%_50%_at_100%_100%,oklch(0.55_0.12_250/0.2),transparent_70%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_55%,black,transparent)] bg-[linear-gradient(to_right,rgb(255_255_255/0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.045)_1px,transparent_1px)] bg-[size:3rem_3rem]"
      />
      {children}
    </aside>
  )
}

// Copacker's box and name, as the app header shows them.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-tight", className)}>
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-[0.625rem] bg-primary text-primary-foreground shadow-lg shadow-orange-500/25"
      >
        <Box className="size-4" />
      </span>
      Copacker
    </span>
  )
}
