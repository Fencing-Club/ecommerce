import { http, HttpResponse } from "msw/http"
import { createRef } from "react"
import { expect, fn, screen, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { pressEscapeIn } from "@/stories/fixtures/marketing"
import { shownDialog } from "@/stories/play"
import { FilmDialog } from "./film-dialog"

const meta = preview.meta({
  title: "Components/Marketing/Film dialog",
  component: FilmDialog,
  args: { open: true, onOpenChange: fn(), returnTo: createRef<HTMLElement>() },
  // The film itself isn't loaded: its request answers with nothing.
  beforeEach: ({ msw }) => {
    msw.use(http.get("https://media.copacker.ai/*", () => new HttpResponse(null, { status: 204 })))
  }
})

export const Open = meta.story({
  play: async ({ args }) => {
    const dialog = await shownDialog("Copacker: Restocking, handled")
    const video = await screen.findByLabelText("Copacker: Restocking, handled", { selector: "video" })
    await expect(dialog.element).toContainElement(video)
    await expect(video).toHaveAttribute("src", "https://media.copacker.ai/film-924d480a.mp4")
    await expect(video).toHaveAttribute("poster", "/marketing/film.jpg")
    await expect(video).toHaveAttribute("preload", "none")
    await expect(video).toHaveAttribute("controls")
    // Escape asks to close it.
    await pressEscapeIn(dialog.element)
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false, expect.anything()))
  }
})

export const Closed = meta.story({
  args: { open: false },
  play: async () => {
    // Closed, the dialog renders nothing, so there's nothing to wait for.
    await expect(screen.queryByRole("dialog")).toBeNull()
    await expect(document.querySelector("video")).toBeNull()
  }
})
