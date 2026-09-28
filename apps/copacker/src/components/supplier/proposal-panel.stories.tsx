import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { http, HttpResponse } from "msw"
import type { ComponentProps } from "react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import type { Permissions } from "@/lib/access"
import { proposedChanges } from "@/stories/fixtures/supplier"
import { member } from "@/stories/workspace"
import { ChangeBadge, ProposalPanel } from "./proposal-panel"

// Each answer the panel sent: the proposal and its body.
const answered = fn()
const orderId = "5e9b2d71-4b3e-4f5a-8c6d-000000000001"
const proposalId = "0c3e7b52-4b3e-4f5a-8c6d-000000000001"

const meta = preview.meta({
  component: ProposalPanel,
  args: {
    proposal: { id: proposalId, status: "pending", note: "Cotton costs went down.\nBaskets are back.", reason: null },
    changes: proposedChanges,
    currency: "USD",
    viewer: "buyer",
    supplierName: "Lotus Manufacturing",
    orderId
  } satisfies ComponentProps<typeof ProposalPanel>,
  beforeEach: ({ msw }) => {
    answered.mockClear()
    msw.use(
      http.post("/api/proposals/:id", async ({ params, request }) => {
        answered(params.id, await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

const rowOf = (name: string) => within(screen.getByText(name).closest("tr")!)

export const ForBuyer = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Lotus Manufacturing proposed changes")).toBeVisible()
    // Small, like the purchase order page's other cards.
    await expect(canvas.getByText("Lotus Manufacturing proposed changes").closest("[data-slot=card]")).toHaveAttribute(
      "data-size",
      "sm"
    )
    await expect(canvas.getByText("Approval needed")).toBeVisible()
    await expect(canvas.getByText(/Cotton costs went down\./)).toBeVisible()
    const tote = rowOf("Canvas tote bag / Natural")
    await expect(tote.getByText("Changed")).toBeVisible()
    await expect(tote.getByText("240")).toHaveClass("line-through")
    await expect(tote.getByText("300")).toBeVisible()
    await expect(tote.getByText("$4.25")).toHaveClass("line-through")
    await expect(tote.getByText("$4.10")).toBeVisible()
    const basket = rowOf("Market basket")
    await expect(basket.getByText("Added")).toBeVisible()
    await expect(basket.getByText("60")).toBeVisible()
    const apron = rowOf("Linen apron / Charcoal")
    await expect(apron.getByText("Removed")).toBeVisible()
    await expect(apron.getByText("120")).toHaveClass("line-through")
    // The mug doesn't change, so it's counted rather than listed.
    await expect(canvas.queryByText("Stoneware mug")).toBeNull()
    await expect(canvas.getByText("1 unchanged")).toBeVisible()
    await expect(canvas.getByText("Net 30")).toHaveClass("line-through")
    await expect(canvas.getByText("Net 15")).toBeVisible()
    await expect(canvas.getByText("Not set")).toBeVisible()
    await expect(canvas.getByText("Nov 2, 2026")).toBeVisible()
    await expect(canvas.getByText("$2,376.00")).toHaveClass("line-through")
    await expect(canvas.getByText("$2,388.00")).toBeVisible()
  }
})

export const Approve = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Approve changes" }))
    await waitFor(() => expect(answered).toHaveBeenCalledWith(proposalId, { action: "approve" }))
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
  }
})

export const ApproveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/proposals/:id", () =>
        HttpResponse.json({ error: "Lotus Manufacturing withdrew these changes." }, { status: 409 })
      )
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Approve changes" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Lotus Manufacturing withdrew these changes.")
    await expect(canvas.getByRole("button", { name: "Approve changes" })).toBeEnabled()
    await expect(getRouter().refresh).not.toHaveBeenCalled()
  }
})

export const Decline = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Decline" }))
    const dialog = within(await screen.findByRole("dialog", { name: "Decline the changes?" }))
    await expect(
      dialog.getByText("The purchase order stays as it is. Lotus Manufacturing sees your reason.")
    ).toBeInTheDocument()
    await userEvent.type(dialog.getByRole("textbox", { name: "Reason" }), "We need the aprons.")
    await userEvent.click(dialog.getByRole("button", { name: "Decline changes" }))
    await waitFor(() =>
      expect(answered).toHaveBeenCalledWith(proposalId, { action: "decline", reason: "We need the aprons." })
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(getRouter().refresh).toHaveBeenCalled()
  }
})

export const DeclineFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.post("/api/proposals/:id", () => HttpResponse.json({}, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Decline" }))
    const dialog = within(await screen.findByRole("dialog"))
    await userEvent.click(dialog.getByRole("button", { name: "Decline changes" }))
    // The error shows in the dialog, which stays open to try again.
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.")
    await expect(canvas.queryByRole("alert")).toBeNull()
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

export const ForSupplier = meta.story({
  args: { viewer: "supplier" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Your proposed changes")).toBeVisible()
    await expect(canvas.getByText("Awaiting approval")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Approve changes" })).toBeNull()
    await expect(canvas.getByRole("button", { name: "Edit" })).toHaveAttribute("href", `/orders/${orderId}/revise`)
    await userEvent.click(canvas.getByRole("button", { name: "Withdraw" }))
    await waitFor(() => expect(answered).toHaveBeenCalledWith(proposalId, { action: "withdraw" }))
  }
})

export const Declined = meta.story({
  args: {
    viewer: "supplier",
    proposal: { id: proposalId, status: "declined", note: "", reason: "We need the aprons." }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Declined")).toBeVisible()
    await expect(canvas.getByText("Reason: We need the aprons.")).toBeVisible()
    // Nothing to answer once declined.
    await expect(canvas.queryByRole("button")).toBeNull()
  }
})

export const OnlyNewTerms = meta.story({
  args: {
    changes: {
      lines: [proposedChanges.lines[1]!],
      paymentTerms: { before: "", after: "Net 15" },
      readyDate: null,
      total: { before: 28_800, after: 28_800 }
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("table")).toBeNull()
    await expect(canvas.getByText("None")).toHaveClass("line-through")
    await expect(canvas.queryByText("Ready date")).toBeNull()
    // An unchanged total reads once.
    await expect(canvas.getByText("$288.00")).not.toHaveClass("line-through")
  }
})

// A member who doesn't see prices gets the changes without them.
export const WithoutPrices = meta.story({
  parameters: { permissions: { role: "member", access: { orders: "edit" } } satisfies Permissions },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("columnheader", { name: "Unit price" })).toBeNull()
    await expect(canvas.queryByText("Total")).toBeNull()
    await expect(canvas.queryByText("$4.10")).toBeNull()
    await expect(canvas.getByRole("button", { name: "Approve changes" })).toBeVisible()
  }
})

// A member who only views orders sees the changes without answering them.
export const ViewOnly = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Approval needed")).toBeVisible()
    await expect(canvas.queryByRole("button")).toBeNull()
  }
})

export const Badges = meta.story({
  render: () => (
    <div className="flex gap-2">
      <ChangeBadge change="added" />
      <ChangeBadge change="changed" />
      <ChangeBadge change="removed" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Added")).toBeVisible()
    await expect(canvas.getByText("Changed")).toBeVisible()
    await expect(canvas.getByText("Removed")).toBeVisible()
  }
})
