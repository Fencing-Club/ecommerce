"use client"

import { Play } from "lucide-react"
import { useTranslations } from "next-intl"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { whenPageIdle } from "./use-page-idle"

// The dialog, with Base UI's focus trap, scroll lock and portal, arrives once the page is idle, or on the first click if
// that comes sooner, so the first view doesn't download it.
const FilmDialog = lazy(() => import("./film-dialog").then(({ FilmDialog: dialog }) => ({ default: dialog })))

// The button that plays the ad, in a dialog (./film-dialog). The button is drawn for a dark stage; `className` restyles it
// for another.
export function Film({ className }: { className?: string }) {
  const t = useTranslations("marketing.film")
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [wanted, setWanted] = useState(false)
  useEffect(() => whenPageIdle(() => setWanted(true)), [])
  return (
    <>
      <Button
        ref={button}
        variant="outline"
        size="lg"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setWanted(true)
          setOpen(true)
        }}
        className={cn(
          "h-11 gap-2 rounded-xl border-white/15 bg-white/[0.04] px-5 text-[0.9375rem] text-white hover:bg-white/10",
          className
        )}
      >
        <Play className="fill-current" />
        {t("watch")}
        <span className="tabular-nums opacity-60">1:45</span>
      </Button>
      {wanted && (
        <Suspense>
          <FilmDialog open={open} onOpenChange={setOpen} returnTo={button} />
        </Suspense>
      )}
    </>
  )
}
