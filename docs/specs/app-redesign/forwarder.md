# Forwarder workspace

Part of the [app redesign spec](README.md). A freight forwarder's workspace, redesigned around its own job instead of
the buyer's purchase order list (F3). A forwarder never sees prices. **New** marks a capability the app doesn't have
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
| Freight | Shipments       | `/shipments`  | `orders` (as today's Edit rules)    | Shipments to ship on        |
| Freight | Purchase orders | `/orders`     | `orders`                            |                             |
| Freight | Clients         | `/clients`    | `orders`                            |                             |
|         | Settings        | `/settings`   | always                              |                             |

The permission model doesn't change: a forwarder's pages all hang off its one area, `orders`, with View or Edit. No
Create menu.

## Home `/home`

1. **To do:** Receive (shipments shipped to you and due), Ship on (every shipment of a PO received), Add tracking
   (shipped on without a reference).
2. **Pipeline:** Expected, Arriving, At warehouse, Shipped on, each with shipments and cartons.
3. **Arriving this week:** by the supplier's ready-for-pickup date and shipped date: shipment, client, supplier,
   cartons, weight, status.

## Shipments `/shipments` (new for forwarders)

Index template over the shipment legs that pass through this forwarder. Today a forwarder can't open shipments; this
exposes the forwarder's slice of each one.

- **Views:**
  - **Expected:** the supplier is packing, or the shipment is ready for pickup and headed here.
  - **Arriving:** shipped by the supplier to this forwarder.
  - **At warehouse (new):** received here, not yet shipped on. Needs a new **Mark received** step on the leg, which
    records when the cartons arrived (date, and cartons received of cartons sent). Buyer
    [Lead times](buyer.md#lead-times) measure the forwarder from this date, so the step is required, not optional.
  - **Shipped on:** shipped by the forwarder.
  - **All.**
- **Filters:** client, supplier, destination (Amazon network or the buyer's location), ready date.
- **Columns:** shipment (PO reference and number), client, supplier, from (pickup city and country), to (destination),
  cartons, weight, ready or shipped date, status.

### Shipment leg `/orders/[id]/shipments/[shipmentId]`

The shared shipment route, the forwarder's view: what `forwarder-view.tsx` shows for a PO, scoped to one shipment.

- **Header:** "PO-1045, shipment 2", status. Primary by stage (Edit): **Mark received** while it's arriving (arrival
  date, cartons received, a note on damage or shortfall), then **Mark shipped**, which opens the existing dialog
  (carrier, tracking or booking number).
- **Meta row:** client, supplier, from, to, ready date.
- **Lifecycle:** Expected, Arriving, At warehouse, Shipped on, Received (when the buyer or Amazon receives it).
- **Next step card:** "Ship 12 cartons on to Amazon FBA ONT8 once they arrive" or "Waiting for Lotus Manufacturing to
  finish packing".
- **Tabs:**
  - **Cartons:** carton number, contents (product and units, no prices), dimensions and weight, Amazon carton label.
    Totals: cartons, units, weight, volume.
  - **Documents:** packing list, commercial invoice, product, carton and shipping labels, the packing checklist, in the
    order they're made. Labels come once the buyer releases them.
  - **Activity:** the shipment's events and comments visible to the forwarder.
- **Rail:** Ship to (the buyer's location address with contact, or the Amazon facility), Pickup (the supplier's
  address and contact), Carrier (entered on Mark shipped).

## Purchase orders `/orders`

Index template for reference, without the buyer's views and stats (F3).

- **Views:** Active, Done, All. Active means at least one shipment hasn't been shipped on.
- **Columns:** purchase order, client, supplier, destination, shipments ("2 of 3 shipped on"), required by, status from
  the forwarder's side (Expected, In progress, Done).

### Purchase order `/orders/[id]`

The shared PO record, the forwarder's view: route, products and quantities, the shipments with their status and Mark
shipped, and documents, as `forwarder-view.tsx` has today, in the record template with tabs **Shipments** (first),
**Items**, **Documents**. No prices, no landed costs, no buyer history.

## Clients `/clients` (new)

The buyers this forwarder works for, from the buyer links on its workspace.

- **Columns:** client, active shipments, cartons expected this week, last shipped on, contact.
- **Client page `/clients/[id]`:** its shipments and POs through this forwarder, the delivery addresses it ships on to,
  and its contact.

## Settings

The forwarder's Settings has Account settings, and in Workspace settings: General, Team, and **Warehouses** (the
forwarder's addresses, today's Addresses section). See [Settings](settings.md).
