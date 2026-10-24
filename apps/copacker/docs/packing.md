# Packing: the ready date, cartons and pallets

The supplier's packing page lists a shipment's cartons, and its pallets when the cartons ship on pallets
(`components/packing-form.tsx`). The designs are copacker.pen's section 10: 10.27 to 10.30 for the tables, 10.10 B
for pallets and 10.10 B1 for choosing a pallet's cartons.

## The page's parts

A shipment has one layout, packing or packed (`ShipmentLayout`): the header, then a column of the notices, the route
(`RouteSection`), the products (`PackedProductsTable`), the cartons (`CartonList`) and the pallets (`PalletList`), beside
the documents and Shipment details. While the shipment is being packed, `PackingForm` fills the layout with the form: the
route with the pickup address, ready date and pallets on its first stop (`PackingDetailsFields`), the tables to edit and
the actions (`PackingActionBar`), and `usePackingDraft` saves, finishes and links the packing. A packed shipment builds
no form: the shipment page fills the layout with the same parts, read-only.

Products, Cartons and Pallets share `PackingSection` (`components/packing-section.tsx`), so they stay alike: a chevron
before the title that closes and opens the list (Products starts closed), a summary beside the title that turns green
once everything is in place, and the list's actions at the end of the line. A list with no rows shows `PackingEmpty`,
which holds Add and Import while packing; once the list has a row they move up to the section's line with Export
(`PackingActions`). The designs are the empty states in 06 / Carton editor / Shared Storybook components.

The route is copacker.pen's section 11, "11 / Shipment route editor": a Route section like Products and Cartons
(`RouteSection`), with the stops on one line as its summary when closed (`RoutePreview`). Open, it's a timeline of
stops and, between them, who moves the goods (`RouteEditor`). Ship from carries the packing's own fields while packing
(the pickup address with Add new address, then the ready date and Packed on pallets, `ReadyDateAndPallets`), so the
section starts open then and stays open while one of them needs fixing; a packed shipment's starts closed. An Amazon
network's About link shows the rules' `summary` lines and the receiver's pages.

A shipment keeps its route as rows of `shipment_stops`, one per stop in order: its kind, the forwarder and address for a
forwarder's stop (foreign keys, so an address a route stops at can't be deleted), and who moves the goods on to the next
stop. The supplier's pickup address is the packing's, and the receiver is where the shipment goes (`shipmentReceiver`),
so neither is stored with the stop. Until the buyer saves a route, the shipment follows its purchase order's: the
supplier, the PO's forwarder, which the supplier ships to, and the final destination, with nobody chosen for the last
leg (`defaultShipmentRoute`). `server/shipment-routes.ts` reads and writes the stops. How the goods travel on the last
leg, which readiness, carrier labels, the packing list and the packet read, isn't stored either: `routeTransport` works
it out from the route. AGL collects the cartons from the stop before it; otherwise the stop the last leg leaves from
hands them over, collected unless it delivers them; the buyer adds a carrier label to each carton when it books the
carrier into Amazon, or arranges the shipping to its own warehouse.

The page builds the route section from the saved route and the places its stops are (`shipmentPlaces` in
`app/(portal)/shipments/destination.ts`, `useShipmentRoute`). The buyer gets Edit route until Amazon has the shipment,
and once after release while nobody has chosen who moves the last leg (`canEditRoute`). The editor's menus offer the
purchase order's forwarder, AGL on the way into Amazon, and the final destination; a leg nobody has chosen asks who
ships it. Save route sends `shipment.route` with the route it started from, and keeps the menus open with the server's
reason when it fails. The section opens by itself while a shipment to Amazon waits for the buyer to choose who moves a
leg.

The carton rules live in `lib/carton-groups.ts`: `maxCartons` (1,000, the most a packing holds), `checkCartons` (the
packing rules the complete cartons break, which the form and the carton import share) and `cartonMeasures` (the
cartons' count, units, gross weight and volume, the pallets' when packed on them, as Shipment details shows them).
Each takes the pieces the purchase order's other shipments hold (`reserved`), as the readiness checks do.

## The ready date

A supplier fills in a packing list for each shipment: where the cartons leave from, the cartons themselves, and the
**Ready date**, the day the cartons are ready for pickup. Drafts save as they are. **Finish packing** runs the readiness
checks in `packingReadiness` (`src/server/readiness.ts`), and the shipment moves on only when they pass.

### Today or later

Packing finishes only with a ready date of today or later. A draft keeps any date, so a draft saved last week with
that week's date still saves, but finishing it asks for a new date. The date is checked when packing finishes, not when
it was entered.

What "today" means depends on where the check runs:

- **The packing form** uses the supplier's own today: the date in the time zone the browser reports (the `tz` cookie,
  see [Localization](localization.md)). The date field's `min` is that day, so the browser's picker offers nothing
  earlier, and the field shows "Choose today or a later date" as soon as an earlier one is chosen, or when Finish
  packing finds one in a saved draft and moves focus to it. That error is the only one: Finish packing adds no summary
  of invalid fields, since each shows its own. The form reads the clock each time it checks, so a page left open past
  midnight moves on to the next day.
- **The server** doesn't know the supplier's time zone, so it accepts any date that is still today somewhere on Earth:
  the date at UTC−12 or later. A supplier's own today is never earlier than that, so the form and the server agree for
  every supplier, ahead of UTC or behind it. A date that has ended everywhere is refused with "Choose a ready date of
  today or later" by the check that runs before Finish packing (`checkPacking`) and by `submitPacking`. The order
  workflow (`orderWorkflow`) lists the same issue for the shipment.

The check applies while the shipment is being packed (`packing`) or corrected (`correction`). A finished packing list
keeps the date the supplier gave: when the buyer prepares an Amazon shipment days later, the date isn't checked again.
The FBA booking starts its ready-to-ship window at the ready date or an hour from now, whichever is later
(`src/server/fba-shipments.ts`).

## Carton IDs

Each carton configuration (cartons with the same contents, size and weight) is a row with a letter, as supplier packing
lists write them, and its cartons count from 1: A1–A10, B1–B6, C1. After Z come AA, AB. A new or duplicated row takes
the next letter not in use (`nextCartonId`), and a row's count numbers its cartons (`expandCartonGroups`). Saved IDs
never change; an ID that isn't a letter and a number, such as an imported `01`, keeps the older suffixes (`01`,
`01-2`). The saved packing list still has one entry per physical carton.

## The carton table

`CartonTable` has one row per configuration, with the same columns at every width so its products line up beneath:
toggle, cartons, count, dimensions (L × W × H in one field), weight per carton, contents and the row menu. From 44rem
wide (the `wide:` variant, an `@container/packing` query) it's a table; narrower, each row is a card with its fields
under labels, and read-only cards put count, dimensions and weight on one line. From 50rem (`wider:`) the fields have
the design's widths; with more room the gaps grow from 1rem to 2rem and contents takes the rest, as the fields never
need more. Between 44rem and 50rem the columns give a little and the dimensions drop their L × W × H hint, so the table
still fits beside Shipment details on a laptop and on a tablet. The product band is a CSS subgrid of the row, so
products line up under the carton's columns at any width.

- A closed row shows its units and what it holds ("1 product, 24 per carton"). Opening it shows its products in a
  lighter band, with Add product at the end. Captions head the first product only.
- Quantities are units. A multipack shows how many packs they make beneath ("10 packs, 2 units each"), from the
  product's units per pack; units that don't fill whole packs are an error.
- A carton's errors sit under its row, and a product's under the product, each outlining the field it names. On a card,
  a field's error sits under the field.
- Rows with errors open, and so do new rows, to add their products; a row also opens when it gets an error, unless it
  was closed by hand. A closed row with errors shows how many by its menu.

### Amazon's packing groups

An FBA carton holds products of one of Amazon's packing groups (see
[carton rules](../../../packages/copacker-packing-rules/docs/carton-rules.md)). Amazon sets the groups only when it
plans a shipment, and the booking job keeps each SKU's group on the shipment ([Amazon inbound](amazon-inbound.md#fba-fba)).
The packing checks (the form, the carton import and readiness) use the shipment's own groups or, until Amazon has
planned it, the latest Amazon set for another of the PO's shipments (`knownPackingGroups`), so a shipment packed again
after Amazon refused its cartons shows which ones mix groups.

The copy doesn't say "packing group", and it names products as the carton lists them, by supplier SKU, or by name for a
product without one (with the variant when two share a name), since the supplier never sees the buyer's SKUs
(`issueValues` in `lib/packing-messages.ts`). Amazon doesn't say why two products are in different groups, so the error
gives the reasons it lists in general: "Products: FBA can't take Cotton drawstring bag and NT-CT-3100 in one carton.
Amazon handles them differently, for example for dangerous goods, prep or labels, and may send them to different
warehouses. Move one of them to another carton." Before
Amazon has planned any of the PO's shipments, the Cartons section says "Products that can share a carton aren't checked
yet" (10.15, and in place on 10.18). The groups aren't fetched live, so it has no Retry button.

## Pallets

**Packed on pallets**, beside Ready date, adds a Pallets section below the cartons (`PalletTable`). Each pallet has
its dimensions and gross weight with the pallet itself, whether it's stackable, and its cartons. A closed pallet shows
how many cartons and units it holds; an open one lists its cartons as runs (B1–B3), each removable. **Choose cartons**
(`PalletCartonsDialog`) lists the cartons by configuration with the pallet each is on; a configuration can split across
pallets, and choosing a carton on another pallet moves it.

`validatePacking` checks pallets only when `palletized` is set: there's at least one pallet, each carton is on exactly
one pallet of the shipment, and no pallet is empty or listed twice. The cartons off pallets show under the table
("2 cartons aren't on a pallet: B1, C1"). Unchecking Packed on pallets leaves the pallets out of the saved draft.
**Finish packing** stays off until every carton, and every pallet when packed on them, is complete and nothing breaks
these rules; the header's "7 of 7 cartons on pallets" turns green, as "420 of 420 units" does for the cartons.

The form's actions sit at the top, in the page header: **Finish packing** (or **Save draft** while units are left to
pack) and the Actions menu with **Save draft**. On a phone the button moves below the cartons. The totals are the side
panel's, so there's no summary bar.

Each draft save moves the shipment to its next revision. The form stays pending until the page has read the shipment
again (`router.invalidate({ sync: true })`), so the next save, a link to an existing AWD shipment and the buyer's
Save route all send the new revision. The form keeps no copy of the revision or the link
(`usePackingDraft`).

When packed on pallets, Shipment details' gross weight and volume are the pallets', not the cartons'.

## Importing cartons and pallets

The upload buttons beside **Add carton** and **Add pallet** open a spreadsheet import (copacker.pen section 11: 11.01
to 11.12 for cartons, 11.13 to 11.15 for pallets). Both use `SpreadsheetImportDialog`: download the template, upload an
XLSX or CSV file, review what it holds ("Review carton import", "Review pallet import"), then add it to what's there or
replace it. The file's own issues (by row) hide that choice, since the other mode won't fix them; issues from adding to
what's there, such as a repeated pallet ID, keep it so **Replace** can clear them. A long list of issues, pallets or
cartons scrolls inside its box, keeping the title, the choice and the buttons in view. Templates download named like
the app's other files ("Pallet template - PO38 - Shipment 1.xlsx"), keep English headers and sheet names (`Cartons`,
`Pallets`) and carry their instructions, in the reader's language, on an Instructions sheet.

Both templates have three sheets: the one to fill in (`Cartons` or `Pallets`), `Example` with the same columns filled in
for this shipment, and `Instructions` (`addGuide` in `lib/spreadsheet-import.ts`): a table of each column, what to
enter and the example's value, then notes on the file. The table headings are `orders.importTemplate`; each template's
column guidance and notes are its `template.columns` and `template.notes`. Only the Instructions sheet turns right to
left for Urdu; the sheets of English headers and values stay left to right.

- **Cartons**: a row per product of the order, its supplier SKU, product, variant and units per pack prefilled in grey.
  The example (`cartonExample`) packs each of the first three products in its own kind of carton (A1 as three identical
  cartons, then B1 and C1), with quantities the order has, so it passes `validatePacking`. It keeps to one product a
  carton, as AWD requires; the notes say how rows sharing a Carton ID make a mixed carton.
- **Pallets**: empty, with Stacking chosen from a list. The example (`palletExample`) splits the shipment's cartons
  across a stackable and a non-stackable pallet, and the notes list the shipment's cartons.

The download buttons beside the upload ones export what the form holds in the same templates ("Cartons - PO38 -
Shipment 1.xlsx", "Pallets - PO38 - Shipment 1.xlsx"), to edit in a spreadsheet and import again with **Replace**. The
templates and their copy come from `useCartonTemplate` and `usePalletTemplate` (`hooks/use-import-templates.ts`), which
the import dialogs share. `cartonRows` writes a row for each product of each kind of carton, above the order's product
rows; a kind's cartons share a row only when the import would number them back the same (A1 with a count of 3 for
A1–A3), and otherwise go in runs or one by one, so a gap (A1, A2, A5) or zero-padded IDs (B01, B02) come back unchanged
and the pallets still find their cartons. `palletRows` writes a pallet to a row, its cartons as runs. Values not entered
yet stay blank, for the import to point out by row.

A pallet file (`lib/pallet-import.ts`) has a row per pallet: Pallet ID, length, width and height in cm, gross weight in
kg, Stacking (Stackable or Not stackable, a list in the XLSX template) and Carton IDs. Carton IDs take IDs and runs as
packing lists write them: `A1–A6, B1`, `A1-A6`, `A10–12`, split by commas (including Chinese and Urdu ones),
semicolons, new lines or spaces. An ID the shipment has, such as `01-2`, is never read as a run. Each row is checked on
its own (a valid size and weight, a stacking value, at least one carton, cartons the shipment has) and against the rows
above it (a pallet ID once, each carton on one pallet), then `validatePallets` checks the imported pallets against the
ones they're added to. Those clashes are listed by the file's pallet and row, naming the pallet already there ("Cartons
A1–A6 are already on Pallet 1"), under a line that points to **Replace pallets**. Cartons left off every pallet don't
stop an import; the Pallets section lists them as usual.

## What Amazon gets

- **FBA**: once Amazon places the cartons, each Amazon shipment's transportation request carries the pallets its
  cartons travel on, identical pallets as one entry with their count, and `freightInformation`: the goods' value at the
  PO's prices, freight class `NONE`. A pallet whose cartons Amazon sends to two warehouses stops the booking with an
  error. With pallets, the buyer's own carrier is booked as less than a truckload when Amazon offers it.
- **AWD**: Amazon's API doesn't take `PALLET` packages yet, so AWD orders send cartons only, and it issues no pallet
  labels. AWD still asks for four pallet labels on each pallet, which the buyer gets from Seller Central. Uploading
  them to the shipment isn't built yet.

## Pallet labels

Once Amazon labels an FBA shipment's cartons, the job also asks for its pallet labels (`fbaPalletLabels`, v0
`getLabels` with `LabelType=PALLET`), one request per Amazon shipment with that shipment's pallet count. Amazon prints
four identical labels for each pallet, one for each side, the pallets in order. `palletLabels` numbers each pallet
within the Amazon shipment its cartons travel in, in packing order, and the job keeps every pallet's four labels
together in one file, `Pallet labels.pdf` (document kind `pallet_label`). A page count that doesn't divide among the
shipment's pallets stops the job.

- **Release**: like carton and carrier labels, the supplier and forwarder get pallet labels only once the buyer
  releases the shipment (`releasedLabelKinds`). An FBA shipment on pallets can't be released without them
  (`missing_pallet_label`).
- **Supplier packet**: the pallet labels come after the carton labels and carrier labels, and before the product
  labels. The packet page offers them on their own as **Pallet labels**.
- **Packing list**: the totals start with the pallet count. Under the cartons, a pallet table gives each pallet, its
  cartons, dimensions, gross weight and whether it's stackable, in the carton table's columns. The packing list
  download shows the same table.
- **Label reference**: after the cartons, a Pallets table gives each pallet's cartons and its pallet label as Amazon
  prints it, the Amazon shipment and the pallet's number there (`FBA18ABCD123 1/2`).
- **Checklist**: a Pallets section comes after the cartons and before Handoff, which holds the bill of lading and
  the pickup. For FBA it gives Amazon's pallet rules for LTL and FTL deliveries
  ([Seller requirements for LTL, FTL and FCL deliveries](https://sellercentral.amazon.com/help/hub/reference/G200978400)):
  40 × 48 in wooden pallets with four-way entry, GMA grade B or better; cartons flush, labels out, nothing over the
  edge; at most 72 in tall including the pallet and 1,500 lb, and 50 in for a stackable pallet; clear stretch wrap
  marked “Do not break stretch wrap”; and the **Pallet labels** step, one of each pallet's four labels on each side,
  at the top center, outside the stretch wrap, each carton keeping its own label. AWD pallets get the same rules and
  the same **Pallet labels** step, though the packet doesn't carry AWD's labels yet. Pallets to the buyer's own
  warehouse or a forwarder get general loading and securing steps. Each line comes from the pallet policy
  ([pallet rules](../../../packages/copacker-packing-rules/docs/pallet-rules.md)).
- **Pallet table**: the pallet editor checks the footprint, height and weight as they're entered, against the policy
  of where the pallet's cartons go, under the field each names, with a link to the receiver's own rule.

Documents name labels by what they go on, not who issues them: Carton labels, Carrier labels and Pallet labels, since
other 3PLs can ask for them too.

Pen: 09.04 B (documents after booking, packed on pallets), 12.01 P03 (FBA pallet freight pickup) and P04 (AWD pallet
freight pickup), 12.03 C06 (FBA pallet freight checklist) and 13.01 L04 (FBA carton and pallet label reference).
