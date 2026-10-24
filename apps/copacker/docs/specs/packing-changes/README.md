# Packing changes spec

Status: **planned**. Nothing here is built yet. Written 2026-10-21 from the decisions below. It replaces Request a
correction. When a part ships, its behavior moves into the regular docs and this spec is trimmed.

It covers what happens when packing changes after it was finished: who can change it, what Copacker redoes by itself,
how a shipment stays in step with its Amazon shipment, and which documents and history are kept. Routes, statuses and
gates are in the [purchase order flow spec](../purchase-order-flow/README.md).

## Decisions

Made on 2026-10-21.

| Topic | Decision |
| --- | --- |
| Who changes packing | **Whoever packs:** the supplier, or the buyer when the supplier isn't on Copacker. A buyer whose supplier is on Copacker never changes the numbers. They tell the supplier in the order's comments and wait for the fix. |
| Request a correction | **Removed.** Changing finished packing is an edit, not a request: no approval and no reason. |
| Edit notice | **None.** Edit packing opens the packing straight away, with no confirmation dialog. Nothing is undone until the packer finishes again, and the timeline records what Copacker did. |
| When | **From packed until the shipment ships.** Not while packing, where the cartons can already be changed, and not after shipping, where differences go in Mark received. |
| The Amazon shipment | When the packer finishes an edited packing and the shipment has an Amazon shipment, **Copacker cancels it** and the shipment goes back to Packed. The buyer books shipping again. |
| Booking | **Book shipping is one step.** It creates or links the Amazon shipment and gets the labels (designs 09.02 for FBA and 09.03 for Amazon Global Logistics). There's no separate Create Amazon shipment step. |
| Missing Amazon shipments | A shipment whose Amazon shipment no longer exists **goes back to Packed**. Copacker updates it at once when it cancels the shipment itself, and a **check every 12 hours** catches shipments cancelled outside Copacker. Amazon has no notification for FBA inbound shipments or AWD orders, so this can't use webhooks. |
| Labels | **Printing the new packet is enough.** There's no separate relabel step. |
| History | Every finished packing is stored as a **revision**: who finished it, when, and its cartons and pallets. The timeline shows each one, and any revision's documents can be made again. |
| Documents | **Every version is kept.** Each finished packing saves a packing list, and every commercial invoice upload is kept. The Documents list shows only the latest of each kind from each party; the timeline links every version. |
| Forwarder | On receipt, the forwarder **passes the supplier's packing on unchanged, or repacks** and finishes its own packing. Its version is used from then on, and the supplier's stays as history. |
| Notifications | **Later:** tell the buyer when the packer changes packing after shipping is booked. See the [notification events](../novu-notifications/events.md). |

## Who does what

What follows when the packer finishes an edited packing, by how far the shipment had got:

| Stage | Copacker | Buyer | Supplier |
| --- | --- | --- | --- |
| Packed, shipping not booked | Saves the packing list and a timeline entry | Nothing extra | Nothing extra |
| Shipping booked | Cancels the Amazon shipment, moves the shipment back to Packed, saves the packing list and a timeline entry | Books shipping again, including any carrier booking | Prints the new packet when the labels arrive |
| Labels sent to the supplier | The same as shipping booked | The same as shipping booked | Prints the new packet and replaces the labels on the cartons |
| Shipped | Not allowed | Records differences in Mark received | Nothing |

A buyer packing for a supplier who isn't on Copacker is the packer, so they finish the edited packing and then book
shipping again themselves.

## Documents

- **Packing list:** saved each time a party finishes packing. Today it's built from the current packing whenever someone
  opens it and is never saved, so earlier versions are lost.
- **Commercial invoice:** every upload is kept.
- **Documents list:** the latest packing list from each party (supplier and forwarder) and the latest invoice. Older
  versions stay in storage, linked from the timeline.
- **File names:** the party and date replace the revision number, so the supplier's and forwarder's lists can't be
  confused after they leave the app, for example `Packing list - PO36 - Shipment 1 - Lotus Manufacturing - 2026-10-21.pdf`.
  The Documents list shows the title, "Packing list", with the party and date under it.

## Timeline

Each change gets an entry that links the document it made:

- The supplier or forwarder finished packing, with the packing list.
- The packer changed finished packing, with what changed, such as "18 cartons, was 16", and the new packing list.
- Copacker cancelled the Amazon shipment, with its ID.
- The Amazon shipment no longer exists, found by the 12-hour check.
- The supplier uploaded a commercial invoice, with the file.

## Forwarder repacking

On receipt, the forwarder either passes the supplier's packing on as it is or repacks: it can change cartons and
pallets completely, then finishes its own packing, which saves its own packing list. The onward shipment uses the
forwarder's version. The supplier's version stays in the history and its packing list stays linked from the timeline.

## Proposed changes to the app

Not decided in detail; this is the likely shape.

- **Packing revisions:** a table of finished packings (shipment, revision, party, who, when, cartons and pallets).
  Shipments keep only the current packing and a draft today.
- **Documents:** packing lists record the party they came from, so the Documents list can show the latest from each.
  Older versions are already kept as outdated rows.
- **Editing finished packing:** `reopenPacking` (Edit packing) works today only while packed with no Amazon shipment.
  It extends to every state before shipping and is limited to the packer. The edit works on a draft, so the finished
  packing, labels and Amazon shipment stay as they are until the packer finishes again, and leaving without finishing
  changes nothing. `correctShipment` and the correction status go away. The shipment page's Request a correction card
  is already gone (2026-10-22); the `shipment.correct` action stays for the API and CLI until Edit packing replaces it.
- **Cancelling:** reuses `cancelAmazonShipment`, which already cancels an AWD order or an FBA inbound plan.
- **The 12-hour check:** a scheduled job reads the Amazon shipment of every booked shipment that hasn't shipped and moves
  any that no longer exists back to Packed.

## Open questions

- **Linked shipments:** when the buyer linked an existing AWD shipment that Copacker didn't create, should Copacker
  cancel it too, or only unlink it?
- **Stock and approval:** today a correction returns the supplier's stock. If an edit changes quantities or prices,
  does it go back through invoice approval?
- **Small edits:** can a weight-only change update the Amazon shipment instead of cancelling it? This depends on what
  Amazon's API allows.
- **Forwarder screens:** what the forwarder's packing page looks like on receipt.
