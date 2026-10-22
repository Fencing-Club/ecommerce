# Amazon booking dialogs

The redesigned AGL and FBA booking flows from `copacker.pen`, in `src/components/booking`: frame group 10 / Amazon booking,
10.02 (Book FBA shipping) and 10.03 (Book Amazon Global Logistics). They're UI only. Nothing calls the server or Amazon
yet, and the shipment page still books through its earlier actions.

## The pieces

- `BookingDialog` is the shell: 512px wide, and one height for every step (30rem, or the window's height less 2rem).
  `BookingStep` builds a step from props: its title and description, its body, its actions and, when it's one of a
  count, where it is in the flow. The body scrolls within the step, and takes focus when it does. Moving to another step
  moves focus to the dialog, so a screen reader announces it.
- `IssueSummary` and `IssuesView` are the one way to show a problem. A single problem shows in place with its fix;
  several collapse into a count whose Review opens the `IssuesView`.
- `FileRow` holds a file or a place to go, with `DownloadAction` or `OpenAction`, or the status the row reached
  (`RowStatus`). `LabelsRow` holds labels still coming from Amazon or a carrier, with Getting labels in Download's place
  until they arrive.
- `TemplateSlot`, `ShipmentPicker`, `OptionList` and `SummaryList` keep their height whatever they hold.

`AglBookingDialog` and `FbaBookingDialog` take the booking as the server knows it (`AglBooking`, `FbaBooking`), `open`
and `onOpenChange`, the step to reopen on, and one callback per action. Every button does one thing; single choices are
radios. Their copy is in the `booking` message namespace. An FBA booking's fees are in its currency's minor
units, as Copacker keeps all money, and show through `useMoney`.

## Stories

`Components/Booking` has a story for every step and variation the two frames draw, and for each piece.

- `src/components/booking/fixtures.ts` holds one booking per state: `agl.start`, `agl.differs`, `fba.expired` and so on.
  A flow's story is its meta's arguments with a fixture and, when it opens later in the flow, `initialStep`. A new state
  is a fixture and a few lines.
- `src/stories/booking.tsx` has what the stories share: `bookingDialog(name)` finds the dialog and checks its one height,
  `dialogBody()`, the `dialogWidth` decorator and `controlled()` for a choice whose parent keeps the value.
- The dialogs are held open (`open: true`), as the shipment page will hold them, so Done asks to close without closing.

## Before wiring them in

- Settle the open product question: FBA booking takes the buyer's own carrier by default (`chooseTransportationOption`
  in `@repo/copacker-shipments/amazon-inbound`), while the design leads with Amazon's quotes.
- Then replace the stories of the live booking flow: `WaitingForLabels`, `Release` and `WaitingForLabelsSupplier` in
  `src/app/(portal)/shipments/[id]/page.stories.tsx`, and `Release` and `ReconcileFba` in
  `src/components/shipment-actions.stories.tsx`.
