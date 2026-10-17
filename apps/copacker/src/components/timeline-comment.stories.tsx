import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { held, recordActions } from "@/stories/fixtures/shared"
import { TimelineComment } from "./timeline-comment"

const meta = preview.meta({
  component: TimelineComment,
  args: { orderId: "order-1045" }
})

export const Post = meta.story({
  play: async ({ canvas, msw }) => {
    const posted = recordActions(msw)
    const box = canvas.getByRole("textbox", { name: "Comment" })
    const post = canvas.getByRole("button", { name: "Post" })
    await expect(box).toHaveAttribute("placeholder", "Leave a comment…")
    // Nothing to post until there's text.
    await expect(post).toBeDisabled()
    await userEvent.type(box, "   ")
    await expect(post).toBeDisabled()
    await userEvent.type(box, "Cartons ship Friday")
    await expect(post).toBeEnabled()
    await userEvent.click(post)
    await waitFor(() =>
      expect(posted).toEqual([
        { action: "order.comment", data: { orderId: "order-1045", message: "Cartons ship Friday" } }
      ])
    )
    // The box clears for the next comment.
    await waitFor(() => expect(box).toHaveValue(""))
    await expect(getStoryRouter().invalidate).toHaveBeenCalled()
  }
})

// Ctrl+Enter (Cmd+Enter on a Mac) posts too.
export const KeyboardShortcut = meta.story({
  play: async ({ canvas, msw }) => {
    const posted = recordActions(msw)
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Comment" }),
      "Labels are attached{Control>}{Enter}{/Control}"
    )
    await waitFor(() =>
      expect(posted).toEqual([
        { action: "order.comment", data: { orderId: "order-1045", message: "Labels are attached" } }
      ])
    )
  }
})

export const Posting = meta.story({
  play: async ({ canvas, msw }) => {
    msw.use(http.post("/api/action", held))
    await userEvent.type(canvas.getByRole("textbox", { name: "Comment" }), "Cartons ship Friday")
    const post = canvas.getByRole("button", { name: "Post" })
    await userEvent.click(post)
    await waitFor(() => expect(post).toHaveAttribute("aria-busy", "true"))
    await expect(post).toBeDisabled()
  }
})

export const Fails = meta.story({
  play: async ({ canvas, msw }) => {
    recordActions(msw, () => HttpResponse.json({ error: "This purchase order is closed" }, { status: 409 }))
    const box = canvas.getByRole("textbox", { name: "Comment" })
    await userEvent.type(box, "Cartons ship Friday")
    await userEvent.click(canvas.getByRole("button", { name: "Post" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("This purchase order is closed")
    // The comment stays to post again.
    await expect(box).toHaveValue("Cartons ship Friday")
  }
})
