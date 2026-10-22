import { http, HttpResponse } from "msw/http"
import { expect, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { held, recordActions } from "@/stories/fixtures/shared"
import { TimelineComment } from "./timeline-comment"

const meta = preview.meta({
  title: "Components/Display/Timeline comment",
  component: TimelineComment,
  args: { orderId: "order-1045" }
})

export const SharedMessage = meta.story({
  play: async ({ canvas, canvasElement, msw }) => {
    const posted = recordActions(msw)
    await expect(canvas.getByText("Only your team can see this comment.")).toBeVisible()
    await userEvent.click(canvas.getByRole("combobox", { name: "Comment visibility" }))
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", { name: "Message supplier" })
    )
    await expect(canvas.getByText("Your team and the supplier can see this message.")).toBeVisible()
    await userEvent.type(canvas.getByRole("textbox", { name: "Comment" }), "Please check the labels")
    await userEvent.click(canvas.getByRole("button", { name: "Post" }))
    await waitFor(() =>
      expect(posted).toEqual([
        {
          action: "order.comment",
          data: { orderId: "order-1045", message: "Please check the labels", visibility: "shared" }
        }
      ])
    )
  }
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
        {
          action: "order.comment",
          data: { orderId: "order-1045", message: "Cartons ship Friday", visibility: "internal" }
        }
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
        {
          action: "order.comment",
          data: { orderId: "order-1045", message: "Labels are attached", visibility: "internal" }
        }
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

// A failure shows inside the box, between what was written and the Post button.
export const Fails = meta.story({
  play: async ({ canvas, msw }) => {
    recordActions(msw, () => new HttpResponse(null, { status: 500 }))
    const textbox = canvas.getByRole("textbox", { name: "Comment" })
    await userEvent.type(textbox, "Cartons ship Friday")
    await userEvent.click(canvas.getByRole("button", { name: "Post" }))
    const alert = await canvas.findByRole("alert")
    await expect(alert).toHaveTextContent("Something went wrong. Try again.")
    const box = within(textbox.parentElement!)
    await expect(box.getByRole("alert")).toBe(alert)
    await expect(textbox).toHaveAccessibleDescription(
      "Only your team can see this comment. Something went wrong. Try again."
    )
    // The comment stays to post again.
    await expect(textbox).toHaveValue("Cartons ship Friday")
    await expect(box.getByRole("button", { name: "Post" })).toBeEnabled()
  }
})

// Dismissing a failure hides it and goes back to the comment, which stays to post again.
export const DismissError = meta.story({
  play: async ({ canvas, msw }) => {
    recordActions(msw, () => new HttpResponse(null, { status: 500 }))
    const textbox = canvas.getByRole("textbox", { name: "Comment" })
    await userEvent.type(textbox, "Cartons ship Friday")
    await userEvent.click(canvas.getByRole("button", { name: "Post" }))
    await canvas.findByRole("alert")
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }))
    await expect(canvas.queryByRole("alert")).toBeNull()
    await expect(textbox).toHaveFocus()
    await expect(textbox).toHaveValue("Cartons ship Friday")
    await expect(textbox).toHaveAccessibleDescription("Only your team can see this comment.")
  }
})

export const SupplierMessage = meta.story({
  args: { counterparty: "customer" },
  play: async ({ canvas, canvasElement, msw }) => {
    const posted = recordActions(msw)
    await userEvent.click(canvas.getByRole("combobox", { name: "Comment visibility" }))
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", { name: "Message customer" })
    )
    await userEvent.type(canvas.getByRole("textbox", { name: "Comment" }), "Ready for collection")
    await userEvent.click(canvas.getByRole("button", { name: "Post" }))
    await waitFor(() =>
      expect(posted).toEqual([
        {
          action: "order.comment",
          data: { orderId: "order-1045", message: "Ready for collection", visibility: "shared" }
        }
      ])
    )
  }
})
