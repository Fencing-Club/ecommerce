"use client"

import { useMounted } from "@mantine/hooks"
import { useTranslations } from "next-intl"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

// The ad, played in a dialog, which ./film loads once the page is idle. The film is served from the copacker-media R2
// bucket, loads only once it's opened, and has its captions burned in. Closing it puts focus back on the button that
// opened it (`returnTo`).
export function FilmDialog({
  open,
  onOpenChange,
  returnTo
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnTo: React.RefObject<HTMLElement | null>
}) {
  const t = useTranslations("marketing.film")
  // Pressed before this arrived, it mounts already asked to open. It opens a moment later instead, so Base UI moves
  // focus into it as it does for any other opening.
  const mounted = useMounted()
  return (
    <Dialog open={open && mounted} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={returnTo}
        className="dark gap-0 overflow-hidden rounded-2xl bg-black p-0 ring-white/15 sm:max-w-5xl"
      >
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        {/* The captions are part of the picture, so there's no separate track. */}
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          aria-label={t("title")}
          className="aspect-video w-full bg-black"
          src="https://media.copacker.ai/film-924d480a.mp4"
          poster="/marketing/film.jpg"
          controls
          autoPlay
          playsInline
          preload="none"
        />
      </DialogContent>
    </Dialog>
  )
}
