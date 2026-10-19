import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { bookingDialog } from "@/stories/booking"
import { FbaBookingDialog } from "./fba-booking"
import { fba } from "./fixtures"

// Booking FBA transport through Amazon, as copacker.pen's 10.02 draws it: every step and every problem, each in the one
// dialog height AGL's booking keeps. Each story is a booking from the fixtures and the step it opens on, in a dialog
// held open as the shipment page holds it.
const meta = preview.meta({
  component: FbaBookingDialog,
  tags: ["vrt"],
  args: {
    booking: fba.choose,
    open: true,
    onOpenChange: fn(),
    onReconnect: fn(),
    onRetry: fn(),
    onCheckAgain: fn(),
    onFix: fn(),
    onRefreshPrices: fn(),
    onBook: fn()
  }
})

// Step 1: where Amazon places the shipment and who carries it, as one choice that starts on the lowest total. Each
// price already has the placement fee and the cheapest carrier in it.
export const ChooseHowToShip = meta.story({
  play: async () => {
    const dialog = await bookingDialog("Choose how to ship")
    await expect(dialog.getByRole("progressbar", { name: "Step 1 of 2" })).toBeVisible()
    const options = dialog.getByRole("radiogroup", { name: "Choose how to ship" })
    await expect(options).toBeVisible()
    const hagerstown = dialog.getByRole("radio", { name: "Hagerstown, MD" })
    await expect(hagerstown).toHaveAttribute("aria-checked", "true")
    await expect(hagerstown).toHaveAccessibleDescription("Lowest total HGR6, includes a $40.20 placement fee $144.12")
    await expect(dialog.getByRole("radio", { name: "5 warehouses" })).toHaveAccessibleDescription(
      "BJC1, IAH3, RDU2, SWF2, MCC1, no placement fee $184.78"
    )
    await expect(dialog.getByText("Amass standard truck")).toBeVisible()
    await expect(dialog.getByText("Cheapest carrier for Hagerstown, MD")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeEnabled()
  }
})

// Only when you want another carrier: the quotes sorted by total, your own carrier one more option. Back keeps the
// carrier you had.
export const ChangeTheCarrier = meta.story({
  play: async () => {
    const choose = await bookingDialog("Choose how to ship")
    await userEvent.click(choose.getByRole("button", { name: "Change" }))
    const dialog = await bookingDialog("Choose a carrier")
    await expect(dialog.getByText("To Hagerstown, MD. Totals include the $40.20 placement fee.")).toBeVisible()
    await expect(dialog.getAllByRole("radio")).toHaveLength(5)
    await expect(dialog.getByRole("radio", { name: "Amass" })).toHaveAttribute("aria-checked", "true")
    await expect(dialog.getByText("Cheapest")).toBeVisible()
    await expect(dialog.getByRole("radio", { name: "Your own carrier" })).toHaveAccessibleDescription(
      "Placement fee only, you pay your carrier directly $40.20"
    )
    await expect(dialog.getByText("Amazon hasn’t shared delivery estimates for these quotes.")).toBeVisible()

    await userEvent.click(dialog.getByRole("radio", { name: "Niuku" }))
    await userEvent.click(dialog.getByRole("button", { name: "Back" }))
    const back = await bookingDialog("Choose how to ship")
    await expect(back.getByText("Amass standard truck")).toBeVisible()
    await userEvent.click(back.getByRole("button", { name: "Change" }))
    const again = await bookingDialog("Choose a carrier")
    await expect(again.getByRole("radio", { name: "Amass" })).toHaveAttribute("aria-checked", "true")
  }
})

// Step 2: what the booking comes to, held until the deadline the description gives. One explicit action books it.
export const ReviewAndBook = meta.story({
  args: { initialStep: "review" },
  play: async ({ args }) => {
    const dialog = await bookingDialog("Review and book")
    await expect(dialog.getByText("Prices are held until Oct 21, 10:31 PM PT.")).toBeVisible()
    await expect(dialog.getByRole("progressbar", { name: "Step 2 of 2" })).toBeVisible()
    await expect(dialog.getByText("HGR6")).toBeVisible()
    await expect(dialog.getByText("Ocean LCL")).toBeVisible()
    await expect(dialog.getByText("Zhangjiagang, China")).toBeVisible()
    await expect(dialog.getByText("Ready Oct 21")).toBeVisible()
    await expect(dialog.getByText("$103.92")).toBeVisible()
    const terms = dialog.getByRole("link", { name: "carrier terms (opens in a new tab)" })
    await expect(terms).toHaveAttribute("target", "_blank")
    await userEvent.click(dialog.getByRole("button", { name: "Book for $144.12" }))
    await expect(args.onBook).toHaveBeenCalledWith({ placementId: "hgr6", quoteId: "amass-standard" })
  }
})

// Booked: what was booked, then each label with its own download. Done asks to close the dialog.
export const Booked = meta.story({
  args: { booking: fba.booked },
  play: async ({ args }) => {
    const dialog = await bookingDialog("Shipment booked")
    await expect(dialog.getByText("Download the labels now, or find them on Shipment 2 anytime.")).toBeVisible()
    await expect(dialog.getByText("Amass standard truck, $144.12")).toBeVisible()
    await expect(dialog.getByText("Booked")).toBeVisible()
    await expect(dialog.getByRole("link", { name: "Download Amazon carton labels" })).toBeVisible()
    await expect(dialog.getByRole("link", { name: "Download Carrier labels" })).toBeVisible()
    await expect(dialog.getByText("From Amass, shared with the supplier")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
  }
})

// Copacker can't reach Amazon: one problem, in place, with its fix. Nothing chosen so far is lost.
export const ReconnectAmazon = meta.story({
  args: { booking: fba.reconnect },
  play: async ({ args }) => {
    const dialog = await bookingDialog("Choose how to ship")
    await expect(dialog.getByText("Copacker’s access to your Amazon account expired.")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Reconnect" }))
    await expect(args.onReconnect).toHaveBeenCalledOnce()
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled()
  }
})

// A failure worth retrying uses the same row as every other problem.
export const OptionsDidNotLoad = meta.story({
  args: { booking: fba.failed },
  play: async ({ args }) => {
    const dialog = await bookingDialog("Choose how to ship")
    await expect(dialog.getByText("Couldn’t load shipping options")).toBeVisible()
    await expect(dialog.getByText("Amazon didn’t respond. Your packing is saved.")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Try again" }))
    await expect(args.onRetry).toHaveBeenCalledOnce()
  }
})

// Amazon can flag several things at once, so they collapse into a count with Review. Back returns from them.
export const PackingIssues = meta.story({
  args: { booking: fba.packingIssues },
  play: async () => {
    const dialog = await bookingDialog("Choose how to ship")
    await expect(dialog.getByText("2 packing issues from Amazon")).toBeVisible()
    await expect(dialog.getByText("Fix them, then check again")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled()
    await userEvent.click(dialog.getByRole("button", { name: "Review" }))
    const issues = await bookingDialog("Fix 2 packing issues")
    await userEvent.click(issues.getByRole("button", { name: "Back" }))
    await bookingDialog("Choose how to ship")
  }
})

// The issues view AGL shares: where, what and the fix, then Check again.
export const IssuesView = meta.story({
  args: { booking: fba.packingIssues },
  play: async ({ args }) => {
    const choose = await bookingDialog("Choose how to ship")
    await userEvent.click(choose.getByRole("button", { name: "Review" }))
    const dialog = await bookingDialog("Fix 2 packing issues")
    await expect(dialog.getByText("Amazon flagged these before quoting. Fix them, then check again.")).toBeVisible()
    await expect(dialog.getByText("Cartons 1–5")).toBeVisible()
    await expect(dialog.getByText("Not yet eligible for FBA in Seller Central")).toBeVisible()
    // Only the cartons have a fix in Copacker.
    await userEvent.click(dialog.getByRole("button", { name: "Edit cartons" }))
    await expect(args.onFix).toHaveBeenCalledWith({ kind: "cartonVolume", first: 1, last: 5 })
    await userEvent.click(dialog.getByRole("button", { name: "Check again" }))
    await expect(args.onCheckAgain).toHaveBeenCalledOnce()
  }
})

// Your own carrier asks only what Amazon needs: the delivery method, the carrier and a delivery window.
export const YourOwnCarrier = meta.story({
  play: async () => {
    const choose = await bookingDialog("Choose how to ship")
    await userEvent.click(choose.getByRole("button", { name: "Change" }))
    const carriers = await bookingDialog("Choose a carrier")
    await userEvent.click(carriers.getByRole("radio", { name: "Your own carrier" }))
    await userEvent.click(carriers.getByRole("button", { name: "Use this carrier" }))
    const dialog = await bookingDialog("Use your own carrier")
    await expect(dialog.getByText("You pay your carrier directly and add their labels to Shipment 2.")).toBeVisible()
    await expect(dialog.getByRole("combobox", { name: "Delivery method" })).toHaveTextContent("Small parcel")
    await expect(dialog.getByRole("combobox", { name: "Carrier" })).toHaveTextContent("DHL Express")
    await expect(dialog.getByRole("combobox", { name: "Amazon delivery window" })).toHaveTextContent(
      "Choose a delivery window"
    )
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled()
  }
})

// Booking your own carrier: the placement fee alone, and nothing to accept from a carrier Amazon books.
export const OwnCarrierBooking = meta.story({
  play: async ({ args }) => {
    const choose = await bookingDialog("Choose how to ship")
    await userEvent.click(choose.getByRole("button", { name: "Change" }))
    const carriers = await bookingDialog("Choose a carrier")
    await userEvent.click(carriers.getByRole("radio", { name: "Your own carrier" }))
    await userEvent.click(carriers.getByRole("button", { name: "Use this carrier" }))
    const own = await bookingDialog("Use your own carrier")
    await userEvent.click(own.getByRole("combobox", { name: "Amazon delivery window" }))
    await userEvent.click(await screen.findByRole("option", { name: "Oct 28 – Nov 3" }))
    await userEvent.click(own.getByRole("button", { name: "Continue" }))
    const dialog = await bookingDialog("Review and book")
    await expect(dialog.getByText("Your own carrier")).toBeVisible()
    await expect(dialog.queryByRole("link", { name: /carrier terms/ })).toBeNull()
    await userEvent.click(dialog.getByRole("button", { name: "Book for $40.20" }))
    await expect(args.onBook).toHaveBeenCalledWith({
      placementId: "hgr6",
      ownCarrier: { method: "smallParcel", carrier: "DHL Express", windowId: "window-1" }
    })
  }
})

// Another carrier, chosen on step 1, carries on to the review and the booking.
export const AnotherCarrier = meta.story({
  play: async ({ args }) => {
    const choose = await bookingDialog("Choose how to ship")
    await userEvent.click(choose.getByRole("button", { name: "Change" }))
    const carriers = await bookingDialog("Choose a carrier")
    await userEvent.click(carriers.getByRole("radio", { name: "Niuku" }))
    await userEvent.click(carriers.getByRole("button", { name: "Use this carrier" }))
    const chosen = await bookingDialog("Choose how to ship")
    await expect(chosen.getByText("Niuku standard truck")).toBeVisible()
    await expect(chosen.getByText("Standard truck, Ocean LCL")).toBeVisible()
    await userEvent.click(chosen.getByRole("button", { name: "Continue" }))
    const dialog = await bookingDialog("Review and book")
    await userEvent.click(dialog.getByRole("button", { name: "Book for $158.37" }))
    await expect(args.onBook).toHaveBeenCalledWith({ placementId: "hgr6", quoteId: "niuku-standard" })
  }
})

// A split plan reviews the same way, with the warehouses' codes under their count.
export const FiveWarehouses = meta.story({
  play: async ({ args }) => {
    const choose = await bookingDialog("Choose how to ship")
    await userEvent.click(choose.getByRole("radio", { name: "5 warehouses" }))
    await userEvent.click(choose.getByRole("button", { name: "Continue" }))
    const dialog = await bookingDialog("Review and book")
    await expect(dialog.getByText("Warehouses")).toBeVisible()
    await expect(dialog.getByText("BJC1, IAH3, RDU2, SWF2, MCC1")).toBeVisible()
    await expect(dialog.getByText("Amass standard courier")).toBeVisible()
    await expect(dialog.getByText("$0.00")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Book for $184.78" }))
    await expect(args.onBook).toHaveBeenCalledWith({ placementId: "split", quoteId: "amass-courier" })
  }
})

// Nothing is booked when prices expire: the fix sits where the problem is, and Book waits for current prices.
export const PricesExpired = meta.story({
  args: { booking: fba.expired, initialStep: "review" },
  play: async ({ args }) => {
    const dialog = await bookingDialog("Review and book")
    await expect(dialog.getByText("Prices expired at Oct 21, 10:31 PM PT.")).toBeVisible()
    await expect(dialog.getByText("Refresh for current prices. Nothing was booked.")).toBeVisible()
    await expect(dialog.queryByText("Pickup")).toBeNull()
    await expect(dialog.getAllByText("—")).toHaveLength(3)
    await expect(dialog.getByRole("button", { name: "Book" })).toBeDisabled()
    await userEvent.click(dialog.getByRole("button", { name: "Refresh prices" }))
    await expect(args.onRefreshPrices).toHaveBeenCalledOnce()
  }
})

// While Amazon and the carrier make the labels, each download waits in place with a spinner.
export const GettingLabels = meta.story({
  args: { booking: fba.gettingLabels },
  play: async () => {
    const dialog = await bookingDialog("Shipment booked")
    await expect(dialog.getByText("Getting them from Amazon")).toBeVisible()
    await expect(dialog.getByText("Getting them from Amass")).toBeVisible()
    for (const waiting of dialog.getAllByRole("button", { name: "Getting labels" })) {
      await expect(waiting).toBeDisabled()
    }
    await expect(dialog.queryAllByRole("link")).toHaveLength(0)
  }
})
