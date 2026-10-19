import { HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { actionHandler, orderId, productHandlers, shownDialog } from "@/stories/fixtures/purchase-orders"
import { portalPage } from "@/stories/server"
import { PurchaseOrderFlow } from "./purchase-order-flow"

const meta = preview.meta({ title: "Prototypes/Purchase order flow", component: PurchaseOrderFlow })

// The approved Pen workflow uses local state while its commercial transitions are reviewed.
function flow(props: React.ComponentProps<typeof PurchaseOrderFlow>) {
  return {
    ...portalPage(
      `/orders/${orderId}`,
      props.viewer ?? "buyer",
      props.viewer === "supplier" ? "Northwind Textiles" : "Harbor Goods"
    ),
    render: () => <PurchaseOrderFlow {...props} />,
    beforeEach: ({ msw }: { msw: { use: (...handlers: ReturnType<typeof productHandlers>) => void } }) => {
      msw.use(
        ...productHandlers(),
        actionHandler(fn(), (body) => {
          if (body.action === "shipment.save") {
            return HttpResponse.json({ ok: true, revision: 2 })
          }
          if (body.action === "shipment.check") {
            return HttpResponse.json({ canSubmit: true, requiresApproval: false, issues: [] })
          }
          return HttpResponse.json({ ok: true })
        })
      )
    }
  }
}

export const BuyerDraft = meta.story({
  ...flow({ initialState: "draft" }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "PO38" })).toBeVisible()
    const shipment = within(canvas.getByRole("region", { name: "Shipment 1" }))
    await expect(shipment.queryByRole("spinbutton")).toBeNull()
    await expect(canvas.getByText("540 items", { exact: true })).toBeVisible()
    await expect(shipment.getByText("$2,208", { exact: true })).toBeVisible()
    await expect(canvas.getByText("$4.10", { exact: true })).toBeVisible()
    await expect(canvas.queryByText("$2,208.00", { exact: true })).toBeNull()
    await expect(
      Math.abs(
        canvas.getByText("Terms", { exact: true }).getBoundingClientRect().top -
          canvas.getByText("Currency", { exact: true }).getBoundingClientRect().top
      )
    ).toBeLessThan(1)
    await userEvent.click(shipment.getByRole("button", { name: "Edit" }))
    await expect(shipment.getByRole("spinbutton", { name: "HG-WBT-NAT quantity" })).toBeVisible()
    await expect(shipment.getByRole("button", { name: "Add products to Shipment 1" })).toBeVisible()
    await expect(shipment.getByRole("button", { name: "Scan products" })).toHaveAttribute("aria-disabled", "true")
    await userEvent.click(shipment.getByRole("button", { name: "Done" }))
    await expect(shipment.queryByRole("spinbutton")).toBeNull()
  }
})
export const WholePackValidation = meta.story({
  ...flow({ initialState: "draft" }),
  play: async ({ canvas }) => {
    const shipment = within(canvas.getByRole("region", { name: "Shipment 2" }))
    await userEvent.click(shipment.getByRole("button", { name: "Edit" }))
    const quantity = shipment.getByRole("spinbutton", { name: /quantity/ })
    for (const invalid of ["121", "0", "-2", "1.5"]) {
      await userEvent.clear(quantity)
      await userEvent.type(quantity, invalid)
      await expect(quantity).toHaveAttribute("aria-invalid", "true")
      await expect(shipment.getByRole("status")).toBeVisible()
      await expect(shipment.getByRole("button", { name: "Done" })).toBeDisabled()
      await expect(canvas.getAllByRole("button", { name: "Send order" })[0]).toBeDisabled()
      await expect(shipment.queryByText(/60.5 packs/)).toBeNull()
    }
    await userEvent.clear(quantity)
    await userEvent.type(quantity, "122")
    await expect(quantity).toHaveAttribute("aria-invalid", "false")
    await expect(shipment.queryByRole("status")).toBeNull()
    await expect(shipment.getByText("61 packs of 2")).toBeVisible()
    await userEvent.click(shipment.getByRole("button", { name: "Done" }))
    await expect(shipment.queryByRole("spinbutton")).toBeNull()
  }
})
export const NarrowShipmentRows = meta.story({
  ...flow({ initialState: "draft" }),
  render: () => (
    <div className="w-138">
      <PurchaseOrderFlow initialState="draft" />
    </div>
  ),
  play: async ({ canvas }) => {
    const shipment = within(canvas.getByRole("region", { name: "Shipment 1" }))
    const quantityHeader = shipment.getByText("Quantity", { selector: "span.text-end" })
    const count = shipment.getByText("420 items")
    await expect(quantityHeader).toBeVisible()
    await expect(
      Math.abs(count.getBoundingClientRect().right - quantityHeader.getBoundingClientRect().right)
    ).toBeLessThan(1)
    await userEvent.click(shipment.getByRole("button", { name: "Edit" }))
    const quantity = shipment.getByRole("spinbutton", { name: "HG-WBT-NAT quantity" })
    const cost = shipment.getByRole("textbox", { name: "HG-WBT-NAT cost" })
    const sku = shipment.getByRole("textbox", { name: "HG-WBT-NAT supplier SKU" })
    const tax = shipment.getByRole("spinbutton", { name: "HG-WBT-NAT tax percent" })
    await expect(Math.abs(tax.getBoundingClientRect().height - quantity.getBoundingClientRect().height)).toBeLessThan(2)
    await expect(tax.closest('[data-slot="input-group"]')!.getBoundingClientRect().width).toBeGreaterThanOrEqual(79)
    await userEvent.clear(tax)
    await userEvent.type(tax, "7.25")
    await expect(tax).toHaveValue(7.25)
    await expect(Math.abs(quantity.getBoundingClientRect().top - cost.getBoundingClientRect().top)).toBeLessThan(2)
    await expect(Math.abs(quantity.getBoundingClientRect().top - sku.getBoundingClientRect().top)).toBeLessThan(2)
    await expect(Math.abs(count.getBoundingClientRect().right - quantity.getBoundingClientRect().right)).toBeLessThan(1)
    await expect(shipment.getByRole("button", { name: "Remove HG-WBT-NAT" })).toBeVisible()
  }
})
export const SupplierAwaitingAcceptance = meta.story({
  ...flow({ viewer: "supplier", initialState: "awaiting", viaForwarder: true }),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("From Harbor Goods").some((element) => element.checkVisibility())).toBe(true)
    await expect(canvas.getByText(/18 Gangqiao Road/)).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Accept order" }))
    const dialog = await shownDialog("Accept order")
    await expect(dialog.getByRole("radio", { name: "Generate invoice" })).toBeChecked()
    await expect(dialog.getByRole("button", { name: "View" })).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
  }
})
export const AcceptWithGeneratedInvoice = meta.story({
  ...flow({ viewer: "supplier", initialState: "awaiting", initialDialog: "accept" }),
  play: async ({ canvas }) => {
    const dialog = await shownDialog("Accept order")
    await userEvent.click(dialog.getByRole("button", { name: "View" }))
    const invoice = await shownDialog("Invoice preview")
    await expect(invoice.getByText("Northwind Textiles")).toBeVisible()
    await userEvent.click(invoice.getByRole("button", { name: "Close" }))
    await userEvent.click(dialog.getByRole("button", { name: "Accept order" }))
    await expect(canvas.getByText("Accepted", { exact: true })).toBeVisible()
    await expect(canvas.getByText("You accepted the order.")).toBeVisible()
  }
})
export const InvoiceNeedsUpdating = meta.story({
  ...flow({
    viewer: "supplier",
    initialState: "review",
    change: "quantity",
    initialDialog: "accept",
    missingInvoice: true
  }),
  play: async () => {
    const dialog = await shownDialog("Accept order")
    await expect(dialog.getByRole("radio", { name: "Upload invoice" })).toBeChecked()
    await expect(dialog.getByRole("button", { name: /Drop a PDF/ })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Accept order" })).toBeDisabled()
    await expect(dialog.queryByText("Needs update")).toBeNull()
  }
})
export const SupplierAcceptedOrder = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", viaForwarder: true }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "View shipment" })).toBeVisible()
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "View shipment" }))
    await expect(canvas.getByRole("heading", { name: "Shipment 1" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Import cartons" })).toBeVisible()
    await expect(canvas.queryByRole("heading", { name: "Invoice" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Products (3)" }))
    const productHeader = canvas.getByRole("columnheader", { name: "Product" })
    await expect(getComputedStyle(productHeader).fontSize).toBe("12px")
    await expect(getComputedStyle(productHeader).fontWeight).toBe("400")
    await expect(canvas.queryByText("Quantity / carton")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Back to order" }))
  }
})
export const SupplierMarksPaid = meta.story({
  ...flow({ viewer: "supplier", initialState: "awaiting", viaForwarder: true }),
  play: async ({ canvas }) => {
    const payment = within(canvas.getByRole("region", { name: "Payment" }))
    await userEvent.click(payment.getByRole("button", { name: "Mark as paid" }))
    let dialog = await shownDialog("Mark as paid?")
    await expect(dialog.getByText("Confirm you received $4,356 from Harbor Goods for PO38.")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await expect(payment.getByText("Unpaid", { exact: true })).toBeVisible()
    await userEvent.click(payment.getByRole("button", { name: "Mark as paid" }))
    dialog = await shownDialog("Mark as paid?")
    await userEvent.click(dialog.getByRole("button", { name: "Mark as paid" }))
    await expect(payment.getByText("Paid", { exact: true })).toBeVisible()
    await expect(canvas.getByText("Maya at Northwind Textiles marked $4,356 as paid.")).toBeVisible()
    await expect(canvas.getByText("Awaiting your acceptance", { exact: true })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Accept order" })).toBeVisible()
  }
})
export const SupplierPaymentConfirmation = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", viaForwarder: true, initialPaymentDialog: true }),
  play: async () => {
    const dialog = await shownDialog("Mark as paid?")
    await expect(dialog.getByRole("button", { name: "Mark as paid" })).toBeEnabled()
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible()
  }
})
export const SupplierPaidOrder = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", viaForwarder: true, initialPaid: true }),
  play: async ({ canvas }) => {
    await expect(
      within(canvas.getByRole("region", { name: "Payment" })).getByText("Paid", { exact: true })
    ).toBeVisible()
    await expect(canvas.getByRole("button", { name: "View shipment" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Mark as paid" })).toBeNull()
  }
})
export const SupplierCorrectsPayment = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", initialPaid: true }),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Order actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Mark as unpaid" }))
    const dialog = await shownDialog("Mark as unpaid?")
    await expect(dialog.getByText(/does not issue a refund/)).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Mark as unpaid" }))
    await expect(
      within(canvas.getByRole("region", { name: "Payment" })).getByText("Unpaid", { exact: true })
    ).toBeVisible()
    await expect(canvas.getByText("Maya at Northwind Textiles marked the order as unpaid.")).toBeVisible()
    await expect(canvas.getByText("Maya at Northwind Textiles marked $4,356 as paid.")).toBeVisible()
  }
})
export const BuyerPaidOrder = meta.story({
  ...flow({ viewer: "buyer", initialState: "accepted", viaForwarder: true, initialPaid: true }),
  play: async ({ canvas }) => {
    await expect(
      within(canvas.getByRole("region", { name: "Payment" })).getByText("Paid", { exact: true })
    ).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Order actions" })).toBeNull()
  }
})
export const SupplierPaidMobile = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", viaForwarder: true, initialPaid: true }),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      within(canvas.getByRole("region", { name: "Payment" })).getByText("Paid", { exact: true })
    ).toBeVisible()
    await expect(canvas.getByText("Maya at Northwind Textiles marked $4,356 as paid.")).toBeVisible()
  }
})
export const SupplierProposesChanges = meta.story({
  ...flow({ viewer: "supplier", initialState: "proposing", viaForwarder: true }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "HG-WBT-NAT cost" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Send for approval" }))
    const dialog = await shownDialog("Send changes for approval")
    await expect(dialog.getByRole("radio", { name: "Generate invoice" })).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
  }
})
export const BuyerProposesChanges = meta.story({
  ...flow({ viewer: "buyer", initialState: "proposing", viaForwarder: true }),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Send for approval" }))
    const dialog = await shownDialog("Send changes for approval")
    await expect(dialog.queryByRole("radio", { name: "Generate invoice" })).toBeNull()
    await expect(dialog.getByRole("button", { name: "Send for approval" })).toBeEnabled()
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
  }
})
export const BuyerReviewsSupplierChanges = meta.story({
  ...flow({ initialState: "review", change: "price" }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Revised invoice")).toBeVisible()
    await expect(canvas.getByText("$9.20")).toHaveClass("text-destructive")
    await expect(canvas.getByText("$9.50")).toHaveClass("text-success")
  }
})
export const SupplierReviewsBuyerChanges = meta.story({
  ...flow({ viewer: "supplier", initialState: "review", change: "quantity" }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Current invoice")).toBeVisible()
    await expect(canvas.getByText("240")).toHaveClass("text-destructive")
    await expect(canvas.getByText("300")).toHaveClass("text-success")
    await expect(canvas.getByText("540", { exact: true })).toBeVisible()
    await expect(canvas.getByText("600", { exact: true })).toBeVisible()
    await expect(canvas.getByText("$4,573", { exact: true })).toBeVisible()
    await expect(canvas.getAllByText("$5,143", { exact: true }).length).toBeGreaterThan(0)
  }
})
export const QuantityAndPriceChanges = meta.story({
  ...flow({ initialState: "review", change: "both" }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("300")).toBeVisible()
    await expect(canvas.getByText("$9.50")).toBeVisible()
    await expect(canvas.queryByText("Unit price")).toBeNull()
  }
})
export const RemovedAdjustment = meta.story({
  ...flow({ initialState: "review", change: "removedAdjustment" }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Handling")).toBeVisible()
    await expect(canvas.getByText("Removed")).toBeVisible()
    await expect(canvas.getByText("$25")).not.toHaveClass("text-destructive")
    await expect(canvas.queryByText("Product", { exact: true })).toBeNull()
    await expect(canvas.queryByText("Packing", { exact: true })).toBeNull()
    await expect(canvas.getByText("$4,573", { exact: true })).toBeVisible()
    await expect(canvas.getAllByText("$4,548", { exact: true }).length).toBeGreaterThan(0)
  }
})
export const AddedAndRemovedProducts = meta.story({
  ...flow({ initialState: "review", change: "products" }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Added", { exact: true })).toBeVisible()
    await expect(canvas.getByText("Removed", { exact: true })).toBeVisible()
    await expect(canvas.getByText("Cotton drawstring bag")).toBeVisible()
  }
})
export const RequestRevisions = meta.story({
  ...flow({ initialState: "review" }),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Request changes" }))
    const dialog = await shownDialog("Request changes")
    await expect(dialog.getByRole("button", { name: "Send request" })).toBeDisabled()
    await userEvent.type(dialog.getByRole("textbox", { name: "Message" }), "Please keep the natural towel at $9.20.")
    await userEvent.click(dialog.getByRole("button", { name: "Send request" }))
    await expect(canvas.getByText("Waiting for Northwind Textiles to revise the proposal.")).toBeVisible()
  }
})
export const RejectProposal = meta.story({
  ...flow({ initialState: "review" }),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Order actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reject changes" }))
    const dialog = await shownDialog("Reject changes?")
    await expect(dialog.getByRole("button", { name: "Reject changes" })).toHaveClass("bg-primary")
    await userEvent.click(dialog.getByRole("button", { name: "Reject changes" }))
    await expect(canvas.getByText("The accepted order stays unchanged.")).toBeVisible()
  }
})
export const DeclineInitialOrder = meta.story({
  ...flow({ viewer: "supplier", initialState: "awaiting" }),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Order actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Decline order" }))
    const dialog = await shownDialog("Decline order?")
    await userEvent.type(dialog.getByRole("textbox", { name: "Reason (optional)" }), "We cannot fulfill this quantity.")
    await userEvent.click(dialog.getByRole("button", { name: "Decline order" }))
    await expect(canvas.getByText("This order was declined.")).toBeVisible()
  }
})
export const ForwarderRoute = meta.story({
  ...flow({ initialState: "draft", viaForwarder: true }),
  play: async ({ canvas }) => {
    const shipment = within(canvas.getByRole("region", { name: "Shipment 1" }))
    await expect(
      shipment
        .getAllByText("Supplier ships to Ningbo warehouse")
        .some((element) => element.getBoundingClientRect().height > 0)
    ).toBe(true)
    await expect(
      shipment
        .getAllByText("Amazon pickup from Bayline Freight")
        .some((element) => element.getBoundingClientRect().height > 0)
    ).toBe(true)
    await userEvent.click(shipment.getByRole("button", { name: "Edit" }))
    await userEvent.click(shipment.getByRole("button", { name: "Shipment 1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit stop" }))
    const dialog = await shownDialog("Edit stop")
    await expect(dialog.getByRole("combobox", { name: "Receiving location" })).toHaveTextContent("Ningbo warehouse")
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(shipment.getByRole("combobox", { name: "Shipment 1 transport" })).toHaveTextContent("Amazon pickup")
    await userEvent.click(shipment.getByRole("button", { name: "Done" }))
  }
})
export const TimelineComments = meta.story({
  ...flow({ initialState: "accepted", timelineExample: true }),
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Comment" }), "Please confirm the final carton weights.")
    await userEvent.click(canvas.getByRole("button", { name: "Post" }))
    await expect(await canvas.findByText("Please confirm the final carton weights.", { selector: "p" })).toBeVisible()
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Comment" })).toHaveValue(""))
    await userEvent.click(canvas.getByRole("combobox", { name: "Comment visibility" }))
    await userEvent.click(await screen.findByRole("option", { name: "Message supplier" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Comment" }), "The packing instructions are confirmed.")
    await userEvent.click(canvas.getByRole("button", { name: "Post" }))
    const timeline = within(canvas.getByRole("region", { name: "Timeline" }))
    const internal = timeline.getByText("Please confirm the final carton weights.").closest("li")
    const shared = (await timeline.findByText("The packing instructions are confirmed.", { selector: "p" })).closest(
      "li"
    )
    await expect(internal).toHaveTextContent("Internal comment")
    await expect(shared).toHaveTextContent("Shared with supplier")
    await expect(canvas.getByRole("button", { name: "Post" })).toBeDisabled()
  }
})
export const DeleteShipment = meta.story({
  ...flow({ initialState: "draft" }),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add shipment" }))
    await userEvent.click(canvas.getByRole("button", { name: "Shipment 3 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete shipment" }))
    await expect(canvas.queryByRole("region", { name: "Shipment 3" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Shipment 2 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete shipment" }))
    const dialog = await shownDialog("Delete Shipment 2?")
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(canvas.getByRole("region", { name: "Shipment 2" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Shipment 2 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete shipment" }))
    await userEvent.click((await shownDialog("Delete Shipment 2?")).getByRole("button", { name: "Delete shipment" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(canvas.queryByRole("region", { name: "Shipment 2" })).toBeNull()
    await expect(canvas.getByRole("region", { name: "Shipment 1" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Add shipment" }))
    await expect(canvas.getByRole("region", { name: "Shipment 2" })).toBeVisible()
  }
})
export const PackingRequirements = meta.story({
  ...flow({ initialState: "draft" }),
  play: async ({ canvas }) => {
    await userEvent.click(
      within(canvas.getByRole("region", { name: "Shipment 1" })).getByRole("button", { name: "Edit" })
    )
    await userEvent.click(canvas.getAllByRole("button", { name: "Packing details" })[0]!)
    const details = await shownDialog("Packing details")
    await userEvent.click(details.getByRole("combobox", { name: "Preparation" }))
    await userEvent.click(await screen.findByRole("option", { name: "Polybag" }))
    await expect(details.getByRole("combobox", { name: "Preparation" })).toHaveTextContent("Polybag")
    await userEvent.click(details.getByRole("checkbox", { name: "FNSKU label" }))
    await userEvent.click(details.getByRole("checkbox", { name: "SKU label" }))
    await expect(details.getByRole("checkbox", { name: "FNSKU label" })).not.toBeChecked()
    await expect(details.getByRole("checkbox", { name: "SKU label" })).toBeChecked()
    await userEvent.click(details.getByRole("checkbox", { name: "Choking hazard label" }))
    await expect(details.queryByRole("checkbox", { name: "Country of origin label" })).toBeNull()
    await userEvent.click(details.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await userEvent.click(canvas.getAllByRole("button", { name: "Packing details" })[0]!)
    const reopened = await shownDialog("Packing details")
    await expect(reopened.getByRole("checkbox", { name: "FNSKU label" })).not.toBeChecked()
    await expect(reopened.getByRole("checkbox", { name: "Choking hazard label" })).toBeChecked()
    await expect(reopened.queryByRole("combobox", { name: "Country of origin" })).toBeNull()
  }
})
export const SupplierOrderMobile = meta.story({
  ...flow({ viewer: "supplier", initialState: "awaiting", viaForwarder: true }),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Accept order" })).toBeVisible()
    await userEvent.click(canvas.getAllByRole("button", { name: "Packing details" })[0]!)
    const details = await shownDialog("Packing details")
    await expect(details.getByText("1 per pack", { exact: true })).toBeVisible()
    await expect(details.queryByRole("checkbox")).toBeNull()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})
export const ReviewChangesMobile = meta.story({
  ...flow({ viewer: "supplier", initialState: "review", change: "both" }),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("300")).toBeVisible()
  }
})

export const CostSourceAndAdjustments = meta.story({
  ...flow({ initialState: "draft" }),
  play: async ({ canvas }) => {
    const shipment = within(canvas.getByRole("region", { name: "Shipment 1" }))
    await userEvent.click(shipment.getByRole("button", { name: "Edit" }))
    await userEvent.click(shipment.getByRole("button", { name: "HG-WBT-NAT cost source" }))
    await userEvent.click(await screen.findByRole("radio", { name: /Cost per item/ }))
    await expect(shipment.getByRole("textbox", { name: "HG-WBT-NAT cost" })).toHaveValue("9.50")
    await userEvent.keyboard("{Escape}")
    await userEvent.click(shipment.getByRole("button", { name: "Done" }))
    await userEvent.click(canvas.getByRole("button", { name: "Add adjustment" }))
    const dialog = await shownDialog("Manage cost summary")
    await expect(dialog.getByRole("combobox", { name: "Adjustment" })).toHaveValue("")
    await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled()
    await userEvent.type(dialog.getByRole("combobox", { name: "Adjustment" }), "Packing")
    await userEvent.click(await screen.findByRole("option", { name: /^Packing$/ }))
    await userEvent.clear(dialog.getByRole("spinbutton", { name: "Packing amount" }))
    await userEvent.type(dialog.getByRole("spinbutton", { name: "Packing amount" }), "120")
    await expect(dialog.getByRole("spinbutton", { name: "Packing amount" })).toHaveValue(120)
    await userEvent.click(dialog.getByRole("button", { name: "Save" }))
    await expect(canvas.getByText("$4,548")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Add adjustment" }))
    const reopened = await shownDialog("Manage cost summary")
    await userEvent.click(reopened.getByRole("button", { name: "Remove Packing" }))
    await userEvent.click(reopened.getByRole("button", { name: "Cancel" }))
    await expect(canvas.getByText("$4,548")).toBeVisible()
    await expect(canvas.getByText("Packing", { exact: true })).toBeVisible()
  }
})

export const PendingProposal = meta.story({
  ...flow({ viewer: "buyer", initialState: "proposing" }),
  play: async ({ canvas }) => {
    const quantity = canvas.getByRole("spinbutton", { name: "HG-WBT-NAT quantity" })
    await userEvent.clear(quantity)
    await userEvent.type(quantity, "300")
    await userEvent.click(canvas.getByRole("button", { name: "Send for approval" }))
    const dialog = await shownDialog("Send changes for approval")
    await userEvent.click(dialog.getByRole("button", { name: "Send for approval" }))
    await expect(canvas.getByText("240", { exact: true })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "View proposal" }))
    await expect(canvas.getByText("300", { exact: true })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Accept order" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Back to order" }))
    await expect(canvas.getByText("Proposal sent")).toBeVisible()
  }
})

export const SentOrder = meta.story({
  ...flow({ initialState: "draft" }),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Send order" }))
    await expect(canvas.getByText("Awaiting supplier acceptance")).toBeVisible()
    await expect(canvas.queryByText("Proposal sent")).toBeNull()
    await expect(canvas.queryByRole("heading", { name: "Invoice" })).toBeNull()
  }
})

export const ChangesRequestedByCounterparty = meta.story({
  ...flow({ initialState: "changes_requested", viewer: "buyer" }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Accepted", { exact: true })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Revise proposal" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Withdraw proposal" })).toBeVisible()
  }
})
export const MobileForwarderRoute = meta.story({
  ...flow({ initialState: "draft", viaForwarder: true, mobileRoutes: true }),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("region", { name: "Shipment 2" })).toBeVisible()
    await expect(
      canvas
        .getAllByText("Supplier ships to Ningbo warehouse")
        .some((element) => element.getBoundingClientRect().height > 0)
    ).toBe(true)
  }
})

export const SupplierPacking = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", viaForwarder: true, initialPacking: "editing" }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Shipment 1" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await screen.findByText("Draft saved")).toBeVisible()
    await expect(canvas.getByText("Packing", { exact: true })).toBeVisible()
    await expect(canvas.queryByText("Packed", { exact: true })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Finish packing" })).toBeNull()
    await expect(canvas.queryByRole("heading", { name: "Invoice" })).toBeNull()
  }
})
export const SupplierPackingMobile = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", viaForwarder: true, initialPacking: "editing" }),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save draft" })).toBeVisible()
    await expect(canvas.getByText("Supplier ships to Ningbo warehouse.", { exact: true })).toBeVisible()
  }
})
export const SupplierPackingReady = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", viaForwarder: true, initialPacking: "ready" }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeEnabled()
    await expect(canvas.getByText("540 of 540")).toBeVisible()
  }
})
export const SupplierPacked = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", viaForwarder: true, initialPacking: "packed" }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Packed", { exact: true })).toBeVisible()
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
    await expect(canvas.getByRole("button", { name: "Edit packing" })).toBeVisible()
  }
})
export const FinishSupplierPacking = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", viaForwarder: true, initialPacking: "ready" }),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Finish packing" }))
    await expect(await canvas.findByText("Packed", { exact: true })).toBeVisible()
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Edit packing" }))
    await expect(canvas.getByRole("spinbutton", { name: "Carton 1: Cartons" })).toHaveValue(10)
  }
})
export const ForwarderCollects = meta.story({
  ...flow({ viaForwarder: true, forwarderPickup: true }),
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByText(/Forwarder pickup from Northwind Textiles/).find((element) => element.checkVisibility())!
    ).toBeVisible()
  }
})

export const ReceivingAddressStop = meta.story({
  ...flow({ viaForwarder: true }),
  play: async ({ canvas }) => {
    const shipment = within(canvas.getByRole("region", { name: "Shipment 1" }))
    await userEvent.click(shipment.getByRole("button", { name: "Edit" }))
    await userEvent.click(shipment.getByRole("button", { name: "Shipment 1 actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit stop" }))
    const dialog = await shownDialog("Edit stop")
    await userEvent.click(dialog.getByRole("combobox", { name: "Stop type" }))
    await userEvent.click(await screen.findByRole("option", { name: "Receiving address" }))
    await expect(dialog.getByRole("combobox", { name: "Receiving location" })).toHaveTextContent("Ningbo receiving")
    await expect(dialog.getByText(/120 Port Road/)).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Done" }))
    await userEvent.click(shipment.getByRole("button", { name: "Done" }))
    await expect(
      shipment.getAllByText("Amazon pickup from Harbor Goods").some((element) => element.checkVisibility())
    ).toBe(true)
    await expect(shipment.queryByText("Bayline Freight")).toBeNull()
  }
})
export const SupplierFbaMixedCartons = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", initialPacking: "ready", mixedFba: true }),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("180 of 180")).toBeVisible()
    await expect(canvas.getAllByRole("region", { name: /^Carton [123]$/ })).toHaveLength(3)
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeEnabled()
    await expect(canvas.queryByText(/Enter.*FNSKU/)).toBeNull()
  }
})

export const SupplierPackOnOrder = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", viaForwarder: true, initialPacking: "ready" }),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Finish packing" }))
    await waitFor(() => expect(canvas.getByRole("button", { name: "Download packing list" })).toBeEnabled())
    await userEvent.click(canvas.getByRole("button", { name: "Back to order" }))
    await expect(canvas.getByRole("region", { name: "Purchase order documents" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Download supplier pack" })).toBeEnabled()
    await userEvent.click(canvas.getByRole("button", { name: "View shipment" }))
    await expect(canvas.getByText("Packed", { exact: true })).toBeVisible()
  }
})

export const SupplierPackedMobile = meta.story({
  ...flow({ viewer: "supplier", initialState: "accepted", viaForwarder: true, initialPacking: "packed" }),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Download packing list" })).toBeEnabled()
    const heading = canvas.getByRole("heading", { name: "Shipment 1" })
    await expect(heading.getBoundingClientRect().left).toBeGreaterThanOrEqual(0)
  }
})

export const ShipmentDocumentsReady = meta.story({
  ...flow({
    viewer: "supplier",
    initialState: "accepted",
    viaForwarder: true,
    initialPacking: "packed",
    labelsReady: true
  }),
  play: async ({ canvas, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const summary = within(canvas.getByRole("region", { name: "Shipment summary" }))
    await expect(summary.getByText("18", { exact: true })).toBeVisible()
    await expect(summary.getByText("230.8 kg")).toBeVisible()
    await expect(summary.getByText("1.79 m\u00b3")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Download carton labels" })).toBeEnabled()
    await expect(canvas.queryByRole("button", { name: "Download carrier labels" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Product labels" }))
    await waitFor(() => expect(page.getByRole("menuitem", { name: "FNSKU label" })).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await userEvent.click(canvas.getByRole("button", { name: "Products (3)" }))
    await userEvent.click(canvas.getByRole("button", { name: "Labels for NT-WB-2210" }))
    await waitFor(() => expect(page.getByRole("menuitem", { name: "FNSKU label" })).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await userEvent.click(canvas.getByRole("button", { name: "Back to order" }))
    await userEvent.click(canvas.getByRole("button", { name: "Labels for NT-WB-2210" }))
    await waitFor(() => expect(page.getByRole("menuitem", { name: "FNSKU label" })).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await expect(canvas.getByRole("button", { name: "Download supplier pack" })).toBeEnabled()
    await expect(canvas.getByRole("button", { name: "Product labels" })).toBeEnabled()
    await userEvent.click(canvas.getByRole("button", { name: "View shipment" }))
  }
})
