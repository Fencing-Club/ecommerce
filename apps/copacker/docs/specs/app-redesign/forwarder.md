# Forwarder workspace

Part of the [app redesign spec](README.md). A freight forwarder's workspace, redesigned around its own job instead of
the buyer's purchase order list (F3). A forwarder never sees the buyer's prices; it does see the commercial invoice,
which customs needs, and enters its own freight cost. **New** marks a capability the app doesn't have
yet.

## What a forwarder does

A forwarder is a stop on a PO's route (`via`). For each shipment coming through it, it needs to know what's coming,
from whom and when, then receive the cartons, and ship them on to Amazon or the buyer's location with a carrier and a
tracking number. Its unit of work is the **shipment leg**, not the purchase order.

## Navigation

| Group   | Item            | Route         | Area                                | Count shown                 |
| ------- | --------------- | ------------- | ----------------------------------- | --------------------------- |
|         | Home            | `/home`       | always                              |                             |
|         | Inbox           | `/inbox`      | always                              | Open tasks                  |
| Freight | Shipments       | `/shipments`  | `orders` (as today's Edit rules)    | Shipments to ship onward    |
| Freight | Purchase orders | `/orders`     | `orders`                            |                             |
| Freight | Clients         | `/clients`    | `orders`                            |                             |
|         | Settings        | `/settings`   | always                              |                             |

The permission model doesn't change: a forwarder's pages all hang off its one area, `orders`, with View or Edit. No
Create menu.

## Home `/home`

1. **To do:** Record arrival (shipments shipped to you and due), Combine shipments (at your warehouse, for the same
   client and destination), Ship onward (every shipment of a PO or combined shipment received), Add tracking (shipped
   onward without a reference).
2. **Pipeline:** Expected, Arriving, At warehouse, Shipped onward, each with shipments and cartons.
3. **At your warehouse** (beside To do): what's here, grouped by client and destination with days waiting, so shipments
   that can combine sit together with **Combine**.
4. **Arriving this week:** by the supplier's ready-for-pickup date and shipped date: shipment, client, supplier,
   cartons, weight, status.

## Shipments `/shipments` (new for forwarders)

Index template over the shipment legs that pass through this forwarder. Today a forwarder can't open shipments; this
exposes the forwarder's slice of each one.

- **Views:**
  - **Expected:** the supplier is packing, or the shipment is ready for pickup and headed here.
  - **Arriving:** shipped by the supplier to this forwarder.
  - **At warehouse (new):** received here, not yet shipped onward. Needs a new **Record arrival** step on the leg, which
    records when the cartons arrived (date, and cartons received of cartons sent). Buyer
    [Lead times](buyer.md#lead-times) measure the forwarder from this date. Requiring it before Ship onward is Optional,
    since the purchase order flow spec only proposes that gate.
  - **Combined (new):** combined shipments that haven't departed.
  - **Shipped onward:** shipped by the forwarder.
  - **All.**
- **Filters:** client, supplier, destination (Amazon network or the buyer's location), ready date.
- **Columns:** shipment (PO reference and number), client, supplier, from (pickup city and country), to (destination),
  cartons, weight, ready or shipped date, status.

### Shipment leg `/orders/[id]/shipments/[shipmentId]`

The shared shipment route, the forwarder's view: what `forwarder-view.tsx` shows for a PO, scoped to one shipment.

- **Header:** "PO-1045, shipment 2", status, **Download documents** and ⋯.
- **Next step card** (Edit): **Record arrival** while it's arriving (arrival date, cartons received, a note on damage
  or shortfall), then **Ship onward** with **Combine**, which adds it to a combined shipment for the same client and
  destination. "Ship 12 cartons onward to Amazon FBA ONT8", or "Waiting for Lotus Manufacturing to finish packing".
- **Ship onward:** a dialog (a sheet on a phone) with the mode (ocean, air, courier or truck), carrier, tracking or booking
  number, freight cost in the PO's currency, the date, and the bill of lading, which can come later and blocks nothing.
- **Meta row:** client, supplier, from, to, ready date.
- **Lifecycle:** Expected, Arriving, At warehouse, Shipped onward, Received (when the buyer or Amazon receives it).
- **Tabs:**
  - **Cartons:** carton number, contents (product and units, no prices), dimensions and weight, Amazon carton label.
    Totals: cartons, units, weight, volume.
  - **Documents:** packing list, commercial invoice, product, carton and shipping labels, the packing checklist, in the
    order they're made. Labels come once the buyer releases them.
  - **Activity:** the shipment's events and the comments visible to the forwarder, read-only, since forwarders don't
    comment.
- **Rail:** Ship to (the buyer's location address with contact, or the Amazon facility), Pickup (the supplier's
  address and contact), Carrier (once it's shipped onward).

### Combined shipment `/shipments/combined/[id]` (new)

Several shipments at this warehouse, for the same client and destination, shipped onward together. FBA and AWD never
combine. The buyer sees the same page, and combines for a forwarder not on Copacker.

- **Header:** "Combined shipment CS-1007", status, **Download packing list** and ⋯.
- **Next step card:** **Close combined shipment** with **Add shipments** while it's open (it can take more shipments
  until then), then **Ship onward**. While the buyer releases labels, it waits on the buyer with no action.
- **Lifecycle:** Open, Amazon shipment (Copacker creates one inbound from the forwarder's address with every member's
  cartons when it closes), Labels (the buyer releases the carton labels to the forwarder), Departed, Received.
- **Tabs:** **Shipments** (each member's PO, supplier, cartons, weight, volume, chargeable weight and freight share),
  **Cartons**, **Documents**, **Activity**.
- **Rail:** Ship to, Freight split (by chargeable weight for the mode, duties by customs value), Carrier once it
  departs.

## Purchase orders `/orders`

Index template for reference, without the buyer's views and stats (F3).

- **Views:** Active, Done, All. Active means at least one shipment hasn't been shipped onward.
- **Columns:** purchase order, client, supplier, destination, shipments ("2 of 3 shipped onward"), required by, status from
  the forwarder's side (Expected, In progress, Done).

### Purchase order `/orders/[id]`

The shared PO record, the forwarder's view: route, products and quantities, the shipments with their status and Ship
on, and documents, as `forwarder-view.tsx` has today, in the record template with tabs **Shipments** (first),
**Items**, **Documents**. No prices, no landed costs, no buyer history.

## Clients `/clients` (new)

The buyers this forwarder works for, from the buyer links on its workspace.

- **Columns:** client, active shipments, cartons expected this week, last shipped onward, contact.
- **Client page `/clients/[id]`:** record template with tabs **Shipments** (first), **Purchase orders** and
  **Addresses** (the delivery addresses it ships onward to), and a rail with its contact, active shipments and cartons
  expected this week.

## Settings

The forwarder's Settings has Account settings, and in Workspace settings: General, Team, and **Warehouses** (the
forwarder's addresses, today's Addresses section). See [Settings](settings.md).
