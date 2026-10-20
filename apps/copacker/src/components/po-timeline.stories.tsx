import { HttpResponse } from "msw"
import type { ComponentProps } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { actionHandler, orderId, timelineEntries } from "@/stories/fixtures/purchase-orders"
import { serverStory } from "@/stories/server"
import { PoTimeline } from "./po-timeline"

const actions = fn()

const meta = preview.meta({
  title: "Components/Purchase orders/PO timeline",
  ...serverStory((props: ComponentProps<typeof PoTimeline>) => <PoTimeline {...props} />),
  args: {
    orderId,
    viewer: "Alex Rivera",
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

    // A revision opens to show its lines, with prices and supplier SKUs.
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

// A new purchase order: only the comment box, which Ctrl+Enter posts, and a failure shows under it.
export const CommentFails = meta.story({
  args: { entries: [] },
  beforeEach: ({ msw }) => {
    msw.use(
      actionHandler(actions, () => HttpResponse.json({ error: "This purchase order is closed" }, { status: 409 }))
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryAllByRole("heading", { level: 3 })).toHaveLength(0)
    const box = canvas.getByRole("textbox", { name: "Comment" })
    await userEvent.type(box, "Any update?")
    await userEvent.keyboard("{Control>}{Enter}{/Control}")
    await expect(await canvas.findByText("This purchase order is closed")).toBeVisible()
    await expect(actions).toHaveBeenCalledOnce()
    // What was written stays, to post again.
    await expect(within(canvas.getByRole("region", { name: "Timeline" })).getByRole("textbox")).toHaveValue(
      "Any update?"
    )
  }
})
