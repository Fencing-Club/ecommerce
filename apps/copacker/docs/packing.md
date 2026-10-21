# Packing lists: the ready date

A supplier fills in a packing list for each shipment: where the cartons leave from, the cartons themselves, and the
**Ready date**, the day the cartons are ready for pickup. Drafts save as they are. **Finish packing** runs the readiness
checks in `packingReadiness` (`src/server/readiness.ts`), and the shipment moves on only when they pass.

## Today or later

Packing finishes only with a ready date of today or later. A draft keeps any date, so a draft saved last week with
that week's date still saves, but finishing it asks for a new date. The date is checked when packing finishes, not when
it was entered.

What "today" means depends on where the check runs:

- **The packing form** uses the supplier's own today: the date in the time zone the browser reports (the `tz` cookie,
  see [Localization](localization.md)). The date field's `min` is that day, so the browser's picker offers nothing
  earlier, and the field shows "Choose today or a later date" as soon as an earlier one is chosen, or when Finish
  packing finds one in a saved draft. The form reads the clock each time it checks, so a page left open past midnight
  moves on to the next day.
- **The server** doesn't know the supplier's time zone, so it accepts any date that is still today somewhere on Earth:
  the date at UTC−12 or later. A supplier's own today is never earlier than that, so the form and the server agree for
  every supplier, ahead of UTC or behind it. A date that has ended everywhere is refused with "Choose a ready date of
  today or later" by the check that runs before Finish packing (`checkPacking`) and by `submitPacking`. The order
  workflow (`orderWorkflow`) lists the same issue for the shipment.

The check applies while the shipment is being packed (`packing`) or corrected (`correction`). A finished packing list
keeps the date the supplier gave: when the buyer prepares an Amazon shipment days later, the date isn't checked again.
The FBA booking starts its ready-to-ship window at the ready date or an hour from now, whichever is later
(`src/server/fba-shipments.ts`).
