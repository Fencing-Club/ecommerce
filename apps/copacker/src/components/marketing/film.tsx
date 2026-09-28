"use client"

import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

// The ad, played in a dialog. The film loads only once it's opened, and it has its captions burned in.
export function Film() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="lg"
            className="h-11 gap-2 rounded-xl border-white/15 bg-white/[0.04] px-5 text-[0.9375rem] text-white hover:bg-white/10"
          />
        }
      >
        <Play className="fill-current" />
        Watch the film
        <span className="text-white/50 tabular-nums">1:45</span>
      </DialogTrigger>
      <DialogContent className="dark gap-0 overflow-hidden rounded-2xl bg-black p-0 ring-white/15 sm:max-w-5xl">
        <DialogTitle className="sr-only">Copacker: Restocking, handled</DialogTitle>
        {/* The captions are part of the picture, so there's no separate track. */}
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          className="aspect-video w-full bg-black"
          src="/marketing/film.mp4"
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
