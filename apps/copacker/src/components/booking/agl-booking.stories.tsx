import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { bookingDialog } from "@/stories/booking"
import { AglBookingDialog } from "./agl-booking"
import { agl, chestProtectors, templateIssues } from "./fixtures"

// Booking Amazon Global Logistics, as copacker.pen's 10.03 draws it: every step and every problem, each in the one
// dialog height. Each story is a booking from the fixtures and the step it opens on, in a dialog held open as the
// shipment page holds it.
const meta = preview.meta({
  component: AglBookingDialog,
  args: {
    booking: agl.start,
    open: true,
    onOpenChange: fn(),
    onTemplate: fn(),
    onFix: fn(),
    onCheckAgain: fn(),
    onRefreshShipments: fn(),
    onLink: fn(),
    onRetryLabels: fn()
  }
})

// Step 1: the inventory file to upload in Seller Central, and the slot for the template Amazon gives back. Continue
// waits for the template.
export const Start = meta.story({
  play: async ({ args }) => {
    const dialog = await bookingDialog("Start the shipment in Seller Central")
    await expect(dialog.getByRole("progressbar", { name: "Step 1 of 3" })).toHaveAttribute("aria-valuenow", "1")
    await expect(dialog.getByRole("link", { name: "Download PO36-Shipment-2-inventory.xlsx" })).toHaveAttribute(
      "href",
      "/api/shipments/ship_2/agl/inventory"
    )
    const sellerCentral = dialog.getByRole("link", { name: "Open Seller Central" })
    await expect(sellerCentral).toHaveAttribute("target", "_blank")
    await expect(sellerCentral).toHaveAccessibleDescription("(opens in a new tab)")
    await expect(dialog.getByText("100 units in 5 cartons")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled()

    // Choosing the template hands it on.
    const template = new File(["template"], "box-content.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    })
    const slot = dialog.getByRole("button", { name: "Drop the box-content template here or browse your files" })
    const input = slot.parentElement?.querySelector("input[type=file]")
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("The template slot has no file input")
    }
    await userEvent.upload(input, template)
    await expect(args.onTemplate).toHaveBeenCalledWith(template)
  }
})

// The template filled in place, at the slot's height, and Continue goes on to booking.
export const TemplateFilled = meta.story({
  args: { booking: agl.templateFilled },
  play: async () => {
    const dialog = await bookingDialog("Start the shipment in Seller Central")
    await expect(dialog.getByText("Template filled")).toBeVisible()
    await expect(dialog.getByText("5 cartons and 100 units matched")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Replace" })).toHaveAccessibleDescription("Template filled")

    await userEvent.click(dialog.getByRole("button", { name: "Continue" }))
    const book = await bookingDialog("Book the shipment in Seller Central")
    await expect(book.getByRole("progressbar", { name: "Step 2 of 3" })).toBeVisible()
    // Focus moves to the dialog, so the new step is announced.
    await expect(screen.getByRole("dialog")).toHaveFocus()
    await userEvent.click(book.getByRole("button", { name: "Back" }))
    await bookingDialog("Start the shipment in Seller Central")
  }
})

// Step 2: the filled file to upload to the same shipment, where the transport is booked.
export const Book = meta.story({
  args: { booking: agl.templateFilled, initialStep: "book" },
  play: async () => {
    const dialog = await bookingDialog("Book the shipment in Seller Central")
    await expect(dialog.getByRole("progressbar", { name: "Step 2 of 3" })).toBeVisible()
    await expect(dialog.getByText("Filled for 5 cartons, 100 units")).toBeVisible()
    await expect(dialog.getByRole("link", { name: "Download PO36-Shipment-2-box-content.xlsx" })).toBeVisible()
    await expect(dialog.getByText("Upload the file, choose Amazon pickup and accept the charges")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Continue" }))
    await bookingDialog("Link your Amazon shipment")
  }
})

// Step 3: the four newest shipments, with the one that matches the packing chosen.
export const Link = meta.story({
  args: { booking: agl.templateFilled, initialStep: "link" },
  play: async ({ args }) => {
    const dialog = await bookingDialog("Link your Amazon shipment")
    await expect(dialog.getByRole("progressbar", { name: "Step 3 of 3" })).toBeVisible()
    await expect(dialog.getAllByRole("radio")).toHaveLength(4)
    await expect(dialog.getByRole("radio", { name: "PO36 / Chest protectors" })).toHaveAttribute("aria-checked", "true")
    await expect(dialog.getByText("1 match")).toBeVisible()
    await expect(dialog.getByText("Matches")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Link shipment" }))
    await expect(args.onLink).toHaveBeenCalledWith(chestProtectors.id)
  }
})

// Linked: the labels ready to download, and customs left in Seller Central. Done asks to close the dialog.
export const Done = meta.story({
  args: { booking: agl.linked },
  play: async ({ args }) => {
    const dialog = await bookingDialog("Shipment linked")
    await expect(dialog.queryByRole("progressbar")).toBeNull()
    await expect(dialog.getByText("Linked")).toBeVisible()
    await expect(dialog.getByText("FBA18Z4K2QRL with 5 cartons and 100 units")).toBeVisible()
    await expect(dialog.getByText("5 labels, shared with the supplier")).toBeVisible()
    await expect(dialog.getByRole("link", { name: "Download Carton labels" })).toHaveAttribute(
      "href",
      "/api/shipments/ship_2/labels"
    )
    await expect(dialog.getByRole("link", { name: "Open Customs documents" })).toHaveAttribute("target", "_blank")
    await userEvent.click(dialog.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
  }
})

// Products without an Amazon SKU stop the inventory file, so the dialog opens on them, with nothing to go back to.
export const MissingAmazonSkus = meta.story({
  args: { booking: agl.missingSkus },
  play: async ({ args }) => {
    const dialog = await bookingDialog("2 products need an Amazon SKU")
    await expect(dialog.getByText("Supplier SKU CP-M-XS")).toBeVisible()
    await expect(dialog.queryByRole("button", { name: "Back" })).toBeNull()
    const [first] = dialog.getAllByRole("button", { name: "Add SKU" })
    await expect(first).toHaveAccessibleDescription("Chest protector / Men / XS Supplier SKU CP-M-XS")
    await userEvent.click(first)
    await expect(args.onFix).toHaveBeenCalledWith(agl.missingSkus.missingSkus[0])
    await userEvent.click(dialog.getByRole("button", { name: "Check again" }))
    await expect(args.onCheckAgain).toHaveBeenCalledWith("skus")
  }
})

// A few seconds after the drop: the same slot fills, and Continue waits until it's done.
export const FillingTheTemplate = meta.story({
  args: { booking: agl.filling },
  play: async () => {
    const dialog = await bookingDialog("Start the shipment in Seller Central")
    const progress = dialog.getByRole("progressbar", { name: "Filling the template" })
    await expect(progress).toHaveAttribute("aria-valuenow", "66")
    await expect(progress).toHaveAccessibleDescription("Matching 100 units")
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled()
  }
})

// Case packs carry their own carton details, so the template step goes and the booking takes two steps.
export const SingleSkuCasePacks = meta.story({
  args: { booking: agl.casePacks },
  play: async () => {
    const dialog = await bookingDialog("Book the shipment in Seller Central")
    await expect(
      dialog.getByText("Case packs carry their own carton details, so you can book straight away.")
    ).toBeVisible()
    await expect(dialog.getByText("120 units in 6 case packs")).toBeVisible()
    await expect(dialog.getByRole("progressbar", { name: "Step 1 of 2" })).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Continue" }))
    const link = await bookingDialog("Link your Amazon shipment")
    await expect(link.getByRole("progressbar", { name: "Step 2 of 2" })).toBeVisible()
  }
})

// AWD books by case pack from the packing list, kept apart until AWD's file rules are confirmed.
export const AwdDestination = meta.story({
  args: { booking: agl.awd },
  play: async () => {
    const dialog = await bookingDialog("Book the AWD shipment in Seller Central")
    await expect(dialog.getByText("6 case packs, 144 units")).toBeVisible()
    await expect(dialog.getByRole("link", { name: "Download PO36-Shipment-4-packing-list.pdf" })).toBeVisible()
    await expect(dialog.getByText("In Warehousing and distribution, create it with AGL")).toBeVisible()
    await expect(dialog.getByRole("progressbar", { name: "Step 1 of 2" })).toBeVisible()
  }
})

// Amazon can take a few minutes to list a new shipment: nothing is chosen, and Refresh asks again.
export const NotListedYet = meta.story({
  args: { booking: agl.notListedYet, initialStep: "link" },
  play: async ({ args }) => {
    const dialog = await bookingDialog("Link your Amazon shipment")
    await expect(dialog.getByText("No match yet")).toBeVisible()
    for (const radio of dialog.getAllByRole("radio")) {
      await expect(radio).toHaveAttribute("aria-checked", "false")
    }
    await expect(dialog.getByRole("button", { name: "Link shipment" })).toBeDisabled()
    await userEvent.click(dialog.getByRole("button", { name: "Refresh shipments" }))
    await expect(args.onRefreshShipments).toHaveBeenCalledOnce()
  }
})

// A single problem with the template shows where the template goes, with the one action that fixes it.
export const CartonNeedsRepacking = meta.story({
  args: { booking: agl.cartonNeedsRepacking },
  play: async ({ args }) => {
    const dialog = await bookingDialog("Start the shipment in Seller Central")
    await expect(dialog.getByText("Carton 3 mixes two packing groups")).toBeVisible()
    await expect(dialog.getByText("Men / XS and Men / S need separate cartons")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Edit carton 3" }))
    await expect(args.onFix).toHaveBeenCalledWith(templateIssues[0])
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled()
  }
})

// Several problems collapse into a count where the template goes. Review opens them, and Back returns.
export const SeveralIssues = meta.story({
  args: { booking: agl.severalIssues },
  play: async () => {
    const dialog = await bookingDialog("Start the shipment in Seller Central")
    await expect(dialog.getByText("3 issues in the template")).toBeVisible()
    await expect(dialog.getByText("Fix them in Copacker, then check again")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Review" }))
    const issues = await bookingDialog("Fix 3 issues in the template")
    await userEvent.click(issues.getByRole("button", { name: "Back" }))
    const back = await bookingDialog("Start the shipment in Seller Central")
    await expect(back.getByText("3 issues in the template")).toBeVisible()
  }
})

// Every problem with the template: where, what, and the fix.
export const IssuesViewTemplate = meta.story({
  args: { booking: agl.severalIssues },
  play: async ({ args }) => {
    const start = await bookingDialog("Start the shipment in Seller Central")
    await userEvent.click(start.getByRole("button", { name: "Review" }))
    const dialog = await bookingDialog("Fix 3 issues in the template")
    await expect(dialog.getByRole("progressbar", { name: "Step 1 of 3" })).toBeVisible()
    await expect(dialog.getByText("Men / XS and Men / S are in different packing groups")).toBeVisible()
    await expect(dialog.getByText("Gross weight is missing")).toBeVisible()
    await expect(dialog.getByText("Amazon expects 13 units, packing has 15")).toBeVisible()
    await expect(dialog.getAllByRole("button", { name: "Edit carton" })).toHaveLength(2)
    const editPacking = dialog.getByRole("button", { name: "Edit packing" })
    await expect(editPacking).toHaveAccessibleDescription(
      "Chest protector / Women / M Amazon expects 13 units, packing has 15"
    )
    await userEvent.click(editPacking)
    await expect(args.onFix).toHaveBeenCalledWith(templateIssues[2])
    await userEvent.click(dialog.getByRole("button", { name: "Check again" }))
    await expect(args.onCheckAgain).toHaveBeenCalledWith("template")
  }
})

// A search with nothing to show keeps the list at its height.
export const NoSearchResults = meta.story({
  args: { booking: agl.templateFilled, initialStep: "link" },
  play: async () => {
    const dialog = await bookingDialog("Link your Amazon shipment")
    const search = dialog.getByRole("searchbox", { name: "Search by name or ID" })
    const picker = search.closest("[data-slot=shipment-picker]")
    const height = picker?.getBoundingClientRect().height
    await userEvent.type(search, "FBA19Q7M2KLX")
    await expect(dialog.getByText("No shipments found")).toBeVisible()
    await expect(dialog.getByText("Check the ID, or refresh in a few minutes.")).toBeVisible()
    await expect(picker?.getBoundingClientRect().height).toBe(height)
    await expect(dialog.getByRole("button", { name: "Link shipment" })).toBeEnabled()
  }
})

// The shipment as booked doesn't match the packing: a count where the problem is, and linking waits.
export const DoesNotMatchThePacking = meta.story({
  args: { booking: agl.differs, initialStep: "link" },
  play: async () => {
    const dialog = await bookingDialog("Link your Amazon shipment")
    await userEvent.type(dialog.getByRole("searchbox", { name: "Search by name or ID" }), "PO36")
    await expect(dialog.getByText("Results")).toBeVisible()
    await expect(dialog.getByText("1 result")).toBeVisible()
    await userEvent.click(dialog.getByRole("radio", { name: "PO36 / Chest protectors" }))
    await expect(dialog.getByText("Doesn’t match")).toBeVisible()
    await expect(dialog.getByText("3 products don’t match")).toBeVisible()
    await expect(dialog.getByText("Linking is blocked until they do")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Link shipment" })).toBeDisabled()
  }
})

// After Review on the shipment: each product with Amazon's count and the packing's.
export const IssuesViewMismatch = meta.story({
  args: { booking: agl.differs, initialStep: "link" },
  play: async ({ args }) => {
    const link = await bookingDialog("Link your Amazon shipment")
    await userEvent.type(link.getByRole("searchbox", { name: "Search by name or ID" }), "PO36")
    await userEvent.click(link.getByRole("radio", { name: "PO36 / Chest protectors" }))
    await userEvent.click(link.getByRole("button", { name: "Review" }))
    const dialog = await bookingDialog("3 products don’t match Amazon")
    await expect(dialog.getByText("Amazon has 6, packing has 10")).toBeVisible()
    await expect(dialog.getByText("Amazon has 22, packing has 20")).toBeVisible()
    // Copacker can't fix a count in Amazon, so the rows have no fix.
    await expect(dialog.getAllByRole("button")).toHaveLength(3)
    await userEvent.click(dialog.getByRole("button", { name: "Check again" }))
    await expect(args.onCheckAgain).toHaveBeenCalledWith("match")
  }
})

// While Amazon makes the labels, Download waits in its place with a spinner.
export const GettingLabels = meta.story({
  args: { booking: agl.gettingLabels },
  play: async () => {
    const dialog = await bookingDialog("Shipment linked")
    await expect(dialog.getByText("Getting them from Amazon")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Getting labels" })).toBeDisabled()
    await expect(dialog.queryByRole("link", { name: "Download Carton labels" })).toBeNull()
  }
})

// When Amazon doesn't send them, the labels row becomes the problem, with its fix.
export const LabelsDidNotComeThrough = meta.story({
  args: { booking: agl.labelsFailed },
  play: async ({ args }) => {
    const dialog = await bookingDialog("Shipment linked")
    await expect(dialog.getByText("Couldn’t get the carton labels")).toBeVisible()
    await expect(dialog.getByText("Amazon didn’t respond. Try again in a moment.")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Try again" }))
    await expect(args.onRetryLabels).toHaveBeenCalledOnce()
  }
})
