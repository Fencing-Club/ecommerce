import { HttpResponse } from "msw/http"
import type { ComponentProps } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { actionHandler, createdTimelineEntry, orderId, timelineEntries } from "@/stories/fixtures/purchase-orders"
import { serverStory } from "@/stories/server"
import { PoTimeline } from "./po-timeline"

const actions = fn()

const meta = preview.meta({
  title: "Components/Purchase orders/PO timeline",
  ...serverStory((props: ComponentProps<typeof PoTimeline>) => <PoTimeline {...props} />),
  args: {
    orderId,
    viewerOrg: "Harbor Goods",
    timeZone: undefined,
    entries: timelineEntries,
    prices: true
  },
  beforeEach: ({ msw }) => {
    msw.use(actionHandler(actions))
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Timeline" })).toBeVisible()
    // One heading per day, newest first.
    await expect(canvas.getAllByRole("heading", { level: 3 })).toHaveLength(6)
    // Another company's comment names it; the viewer's own company's doesn't.
    await expect(canvas.getByText("at Lotus Manufacturing")).toBeVisible()
    await expect(canvas.getByText("Please use the recycled polybags.")).toBeVisible()
    await expect(canvas.queryByText("at Harbor Goods")).toBeNull()
    await expect(canvas.getByText("Supplier set the ready date to Oct 5, 2026")).toBeVisible()
    await expect(canvas.getByText("Bayline Freight shipped the goods: MAEU 204113")).toBeVisible()
    await expect(canvas.getByText("Purchase order emailed to Lotus Manufacturing")).toBeVisible()
    // Only comments have avatars: the comment box spans the timeline.
    await expect(canvas.getAllByText("AR")).toHaveLength(1)
    // Revisions start collapsed.
    for (const name of ["Revision 2: Approved supplier changes", "Purchase order created"]) {
      await expect(canvas.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false")
    }
    await expect(canvas.queryByText(/TOTE-NAT/)).toBeNull()
  }
})

// A revision opens to show its lines, with prices and supplier SKUs.
export const RevisionLines = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Revision 2: Approved supplier changes" }))
    await expect(await canvas.findByText("TOTE-NAT: 300 units at $4.25, supplier SKU LM-TOTE")).toBeVisible()
    // The first revision is the purchase order being created, without a number.
    await userEvent.click(canvas.getByRole("button", { name: "Purchase order created" }))
    await expect(await canvas.findByText("TOTE-NAT: 240 units at $4.25")).toBeVisible()
  }
})

export const PostComment = meta.story({
  play: async ({ canvas }) => {
    const post = canvas.getByRole("button", { name: "Post" })
    await expect(post).toBeDisabled()
    const box = canvas.getByRole("textbox", { name: "Comment" })
    await userEvent.type(box, "Labels are attached")
    await userEvent.click(post)
    await waitFor(() =>
      expect(actions).toHaveBeenCalledWith({
        action: "order.comment",
        data: { orderId, message: "Labels are attached", visibility: "internal" }
      })
    )
    // The box clears for the next comment.
    await waitFor(() => expect(box).toHaveValue(""))
  }
})

export const WithoutPrices = meta.story({
  args: { prices: false },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Revision 2: Approved supplier changes" }))
    await expect(await canvas.findByText("TOTE-NAT: 300 units, supplier SKU LM-TOTE")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Purchase order created" }))
    await expect(await canvas.findByText("TOTE-NAT: 240 units")).toBeVisible()
    await expect(canvas.queryByText(/\$4\.25/)).toBeNull()
  }
})

// The supplier's view: the buyer's comments name its company, the supplier's own don't, and shared comments and
// messages are with the customer.
export const Supplier = meta.story({
  args: { viewerOrg: "Lotus Manufacturing", counterparty: "customer" },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Alex Rivera")).toHaveTextContent("Alex Rivera at Harbor Goods")
    await expect(canvas.getByText("Mei Chen")).toHaveTextContent(/^Mei Chen$/)
    await expect(canvas.queryByText("at Lotus Manufacturing")).toBeNull()
    await expect(canvas.getAllByText("Shared with customer")).toHaveLength(2)
    await expect(canvas.queryByText("Shared with supplier")).toBeNull()
    await userEvent.click(canvas.getByRole("combobox", { name: "Comment visibility" }))
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", { name: "Message customer" })
    )
    await expect(canvas.getByRole("combobox", { name: "Comment visibility" })).toHaveTextContent("Message customer")
    await expect(canvas.getByText("Your team and the customer can see this message.")).toBeVisible()
  }
})

// A closed purchase order: no comment box, and the page leaves its comments out, so the line starts at the first stop.
export const Closed = meta.story({
  args: { commentable: false, entries: timelineEntries.filter((entry) => !entry.comment) },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("textbox", { name: "Comment" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Post" })).toBeNull()
    await expect(canvas.getByText("Supplier set the ready date to Oct 5, 2026")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Purchase order created" })).toBeVisible()
  }
})

// A new purchase order: its first stop under the comment box, which Ctrl+Enter posts, and a failure shows in the box.
export const CommentFails = meta.story({
  args: { entries: [createdTimelineEntry] },
  beforeEach: ({ msw }) => {
    msw.use(actionHandler(actions, () => new HttpResponse(null, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("heading", { level: 3 })).toHaveLength(1)
    await expect(canvas.getByRole("button", { name: "Purchase order created" })).toBeVisible()
    const timeline = within(canvas.getByRole("region", { name: "Timeline" }))
    const box = timeline.getByRole("textbox", { name: "Comment" })
    await userEvent.type(box, "Any update?")
    await userEvent.keyboard("{Control>}{Enter}{/Control}")
    await expect(await timeline.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.")
    await expect(actions).toHaveBeenCalledOnce()
    // What was written stays, to post again.
    await expect(box).toHaveValue("Any update?")
  }
})
