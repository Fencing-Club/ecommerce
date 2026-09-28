"use client"

import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

// A copy button that says when it worked: the copy icon spins out as a check spins in, and "Copy" rolls over to
// "Copied". Whoever holds the clipboard says when it's `copied`, so the snippet it belongs to can light up with it.
export function CopyButton({ copied, onCopy, className }: { copied: boolean; onCopy: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className={cn(
        "flex h-8 items-center gap-1.5 overflow-hidden rounded-lg px-2.5 text-xs font-medium ring-1 transition-[background-color,color,box-shadow] duration-300 outline-none focus-visible:ring-3 focus-visible:ring-white/40",
        copied
          ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40"
          : "bg-white/[0.08] text-white/85 ring-white/15 hover:bg-white/15",
        className
      )}
    >
      <span className="relative size-3.5">
        <Copy
          aria-hidden
          className={cn(
            "absolute inset-0 size-3.5 transition-[opacity,scale,rotate] duration-300",
            copied && "scale-50 -rotate-90 opacity-0"
          )}
        />
        <Check
          aria-hidden
          strokeWidth={3}
          className={cn(
            "absolute inset-0 size-3.5 transition-[opacity,scale,rotate] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            !copied && "scale-50 rotate-90 opacity-0"
          )}
        />
      </span>
      <span className="grid">
        <span
          className={cn(
            "col-start-1 row-start-1 transition-[opacity,translate] duration-300",
            copied && "-translate-y-3 opacity-0"
          )}
        >
          Copy
        </span>
        <span
          aria-hidden
          className={cn(
            "col-start-1 row-start-1 transition-[opacity,translate] duration-300",
            !copied && "translate-y-3 opacity-0"
          )}
        >
          Copied
        </span>
      </span>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  )
}
