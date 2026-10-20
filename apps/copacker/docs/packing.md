# Packing: cartons and pallets

The supplier's packing page lists a shipment's cartons, and its pallets when the cartons ship on pallets
(`components/packing-form.tsx`). The designs are copacker.pen's section 06: 06.27 to 06.30 for the tables, 06.10 B
for pallets and 06.10 B1 for choosing a pallet's cartons.

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
under labels, and read-only cards put count, dimensions and weight on one line. From 50rem (`wider:`) the columns have
the design's widths and gaps; between 44rem and 50rem they give a little and the dimensions drop their L × W × H hint,
so the table still fits beside Shipment details on a laptop and on a tablet. The product band is a CSS subgrid of the
row, so products line up under the carton's columns at any width.

- A closed row shows its units and what it holds ("1 product, 24 per carton"). Opening it shows its products in a
  lighter band, with Add product at the end. Captions head the first product only.
- Quantities are units. A multipack shows how many packs they make beneath ("10 packs, 2 units each"), from the
  product's units per pack; units that don't fill whole packs are an error.
- A carton's errors sit under its row, and a product's under the product, each outlining the field it names. On a card,
  a field's error sits under the field.
- Rows with errors open, and so do new rows, to add their products; a row also opens when it gets an error, unless it
  was closed by hand. A closed row with errors shows how many beside its units.

## Pallets

**Packed on pallets**, beside Ready date, adds a Pallets section below the cartons (`PalletTable`). Each pallet has
its dimensions and gross weight with the pallet itself, whether it's stackable, and its cartons. A closed pallet shows
how many cartons and units it holds; an open one lists its cartons as runs (B1–B3), each removable. **Choose cartons**
(`PalletCartonsDialog`) lists the cartons by configuration with the pallet each is on; a configuration can split across
pallets, and choosing a carton on another pallet moves it.

`validatePacking` checks pallets only when `palletized` is set: there's at least one pallet, each carton is on exactly
one pallet of the shipment, and no pallet is empty or listed twice. The cartons off pallets show under the table
("2 cartons aren't on a pallet: B1, C1"). Unchecking Packed on pallets leaves the pallets out of the saved draft.

When packed on pallets, Shipment details' gross weight and volume are the pallets', not the cartons'.

## What Amazon gets

- **FBA**: once Amazon places the cartons, each Amazon shipment's transportation request carries the pallets its
  cartons travel on, identical pallets as one entry with their count, and `freightInformation`: the goods' value at the
  PO's prices, freight class `NONE`. A pallet whose cartons Amazon sends to two warehouses stops the booking with an
  error. With pallets, the buyer's own carrier is booked as less than a truckload when Amazon offers it.
- **AWD**: Amazon's API doesn't take `PALLET` packages yet, so AWD orders send cartons only.
- **Documents**: the supplier packet's packing list lists each pallet with its cartons, size and gross weight.

Pallet import (07.13 to 07.15) isn't built yet.
