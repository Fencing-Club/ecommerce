# Consistency: one source for every concept

Part of the [app redesign spec](README.md). The first round of screens was drawn by several designers in parallel, and
the same concept came out in different shapes: three action bar styles across 12 bars, three lifecycle trackers, three
next step cards, segmented controls at four heights, icon buttons at five sizes. This page records the audit of every
screen on the canvas (56 desktop and phone screens), what was fixed, and the rules that keep it from happening again.

## The rule

A concept that appears on more than one screen is a **component** or a **token**, and screens use it; they never redraw
it. Components come from the CopackerShadcn library (`designs/CopackerShadcn.lib.pen`, shadcn's base-vega), or, for the
few concepts shadcn has nothing for, from the Copacker kit page, built from library parts. A screen may override an instance's content, state and size, not its styling.
When a concept needs a new shape, change the component, so every screen moves together.

## Components

| Concept                  | Component             | Sizes and states                                                                 | Used for                                                    |
| ------------------------ | --------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| App header               | Top Bar (kit)         | Inbox count; Create is an outline Button, the count a Badge                      | Every desktop screen                                        |
| Phone header             | Mobile Top Bar (kit)  | Inbox count; ghost icon Buttons at 44 px                                         | Every phone screen                                          |
| Workspace switcher       | Sidebar Workspace (kit) | Sidebar Menu Button, size lg: kind tile and initials, workspace name           | The top of every sidebar                                    |
| Navigation item          | Sidebar Menu Button   | Default, active (`sidebar-accent` fill, weight 500), count                       | Sidebars and the settings navigation                        |
| Status                   | Status (kit)          | A Badge with a dot; five tones, below                                            | Every status and state label                                |
| Button                   | Button / Default      | 36 px, sm 32, lg 40; icon optional                                               | The one primary action in a view                            |
| Secondary button         | Button / Outline      | 36 px, sm 32, lg 40; icon optional                                               | Everything else that's a button with a label                |
| Icon button              | Button / Outline icon | 36 px, sm 32, lg 40; ghost for quiet row menus                                   | ⋯ menus, close, columns, pagination, duplicate, remove      |
| Tab                      | Tab Trigger / Line    | Default, active (2 px underline), count                                          | Views on lists, tabs on records                             |
| Checkbox                 | Checkbox Box          | 16 px; unchecked, checked                                                        | Row selection, options                                      |
| Switch                   | Switch Track          | 32 by 18.4 px; off, on                                                           | Settings, inventory tracking, catalog options               |
| Lifecycle stage          | Lifecycle Stage (kit) | Done, current, needs attention, upcoming                                         | Record lifecycle trackers on desktop                        |
| Lifecycle, compact       | Lifecycle Compact (kit) | Up to 8 stages; collapsed or expanded                                          | Record lifecycle trackers on a phone                        |
| Next step                | Next Step (kit)       | Your next step (warm) or waiting (quiet); alert, meta, 2 actions; no detail paragraph | Every PO, shipment and leg                                   |
| Notice                   | Alert                 | Warning, info or destructive tint; one line and an Alert Action, no dismiss      | The only notice on a page, at most one                       |
| Info tip                 | Info Tip (kit)        | 14 px info icon; its text is the instance name after "Info Tip: "                 | Definitions beside labels, card titles and column headers    |
| Tooltip                  | Tooltip Bubble        | Dark bubble                                                                      | What an info tip reveals on hover or focus                   |
| Optional marker          | Badge / Outline, named Optional | A design annotation, never shipped                                     | Proposed items the specs haven't committed to yet            |

Sizes are base-vega's, as the designs draw them and the app's components (buildkit's Vega kit) have them.

Patterns built from these, with one construction each: page header, filter bar (search field and filter chips at
34 px), cards (10 px radius, 15/600 title, 14 by 16 header padding), tables (header band `muted`, 9 by 16 padding,
12/500 labels), segmented controls (32 px, 3 px inset, 26 px segments), packing requirements card, pipeline (row on
desktop, stage list on a phone), KPI strip (row on desktop, 2 by 2 on a phone).

Still drawn once each, and to become components when a second screen needs them: the dialogs (Close purchase order,
Submit packing list and Ship onward, which share one construction) and the Ship onward sheet, the role radio cards
(Member access), the command menu, the Stock flow map.

## Tokens

Every color on a screen is a variable from the CopackerShadcn library: one of shadcn's tokens, or, for a color shadcn
has no token for, a Tailwind v4 palette color (`green-800`, `amber-50` and so on). There are no tokens of our own. The
table in [styling](../../styling.md#theme) lists which palette colors take which role, in the designs and in code.

Allowed literal colors, because they're content, not UI: store logos (Shopify, Amazon, eBay) and product option
swatches. White is written as `#FFFFFF` on filled buttons and chips.

Type: page titles 24/600 on desktop and 22/600 on a phone; card titles 15/600; body 14; meta 12 and 13. Radii: 8 for
controls, 10 for cards, 12 for the action bar, full for pills.

## Statuses

One label, one tone, everywhere. The rule: **warning** when the viewer has to act, **info** while someone else is
working, **success** when something is ready or done well, **neutral** when it's idle or filed, **destructive** when it
failed or is lost.

| Tone        | Labels                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| Neutral     | Draft, Closed, Archived, Received, Expected, Paused, Not invited, Not connected, Coming soon, Unchanged, Pending, Unknown |
| Info        | With supplier, Awaiting acceptance, Accepted, Packing, In transit, At the forwarder, Waiting for labels, Receiving, Shipped, Shipped onward, In progress, Invited, Unfulfilled, Updated |
| Success     | Ready for pickup, Delivered, Fulfilled, Active, In stock, On Copacker, Connected, Up to date, New, Added       |
| Warning     | To accept, To pack, Approval needed, Approve invoice, Changes proposed, Changes declined, Declined, Needs booking, Needs delivery request, Needs shipping labels, At warehouse, Needs label, Awaiting price, Reorder soon, Invitation expired, Needs reconnecting, Changed |
| Destructive | Needs attention, Cancelled, Out of stock, Out of stock on Amazon, Reorder now, Authorization expired, Removed   |

"To pack" moved from info to warning in this audit: it's the supplier's own move. "Declined" is warning because the
buyer has to choose what to do next. A sales order's "Shipped" is info like a shipment's, as the design draws it, and
its "Pending" (waiting for Amazon's price) is neutral.

Progress indicators use the same meanings: lifecycle stages and step lists are **green** when done, **blue** when
current, **amber** when they need the viewer and **gray** when upcoming. Black is never a state. Categories, such as the
FBA and AWD US network tags, are neutral gray tags, never colored like a status.

## Canonical scenario data

Every screen tells one story. Before adding a screen, reuse these facts.

| Fact                       | Value                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Today                      | Monday, September 28, 2026. Future dates carry 2026.                                                    |
| Buyer                      | Harbor Goods, Inc.; Alex Rivera, Purchasing lead (owner); EIN 12-3456789; sells on Shopify, Amazon and eBay (harborgoods) |
| Supplier                   | Lotus Manufacturing, Dongguan, China; Mei Chen; sells on eBay (lotus-home-goods)                        |
| Other partners             | Northwind Textiles (Ningbo), Cedar Works; forwarders Bayline Freight (Ningbo), Pacific Consolidators; Harbor Goods' own Oakland warehouse |
| PO-1045                    | 420 units, $2,958.00, required by Nov 15, ready Oct 2, Net 30, via Bayline Freight to Amazon FBA ONT8 and AWD US; accepted Sep 24; Bayline arranges shipping and customs; Incoterm FOB Ningbo (Optional) |
| PO-1045 lines              | Canvas tote bag, Natural (HG-TOTE-NAT, LM-CT-NAT), 200 at $5.40, FBA; Linen apron, Sage (HG-APRON-SG, LM-LA-SAG), 120 at $8.90, FBA; Market basket, Large (HG-BASKET-L, LM-MB-L), 100 at $8.10, AWD US |
| PO-1045 proposal           | Revision 2: totes to 240, apron to $9.40, large basket replaced by medium (HG-BASKET-M, LM-MB-M) 120 at $6.95; 480 units, $3,258.00 |
| Shipment 1                 | 12 cartons, 240 units (180 totes, 60 aprons), invoice INV-LM-2291 for $2,016.00, carton 7 at 23.4 kg    |
| Forwarder's shipment 2     | 12 cartons, 290 units, 186.4 kg, 0.83 m³, carrier Matson                                                |
| Amazon carton limits       | FBA 91.44 × 63.5 × 63.5 cm (36 × 25 × 25 in); AWD 63.5 cm (25 in) a side; both 22.67 kg (50 lb), written in cm and kg first |
| Other scenario POs         | PO-1051 to accept (Lotus, 520 units, $3,443.00, required by Dec 20, to FBA, AWD US and Oakland); PO-1047 declined (Cedar Works); PO-1048 Global Logistics (Northwind to AWD US); PO-1049 Amazon GWD (Lotus); PO-1040 receiving |
| CS-1007                    | Combined shipment at Bayline: PO-1042 shipment 2 (Lotus) and PO-1050 shipment 1 (Northwind), waiting for labels |
| Sidebar counts             | Buyer: Inbox 8, Purchase orders 4, Shipments 4, Restock 4. Supplier: Inbox 6, Orders 5, Shipments 2, Inventory 5. Forwarder: Inbox 5, Shipments 2 |

Product photos: within a workspace, one image per product (the buyer's come from Shopify, the supplier's from its own
catalog, so they can differ between workspaces).

## Checking it again

Before handing screens over, and after anyone adds one:

1. **No redrawn components.** Search the canvas for frames named like a component (Button, Status, Tab, Nav, Save or
   Action bar, Lifecycle, Next step, Checkbox, Switch, icon-only buttons) that aren't instances.
2. **No literal colors** except logos and swatches.
3. **Same label, same tone** for every status.
4. **Shell data** (sidebar counts, inbox count, workspace chip) matches the table above.
5. **Scenario facts** (products, totals, dates, places, people) match the table above.
6. **Every page with a horizontal visualization has a phone screen** ([Responsive](design-spec.md#horizontal-visualizations-on-a-phone)).
7. **Copy**: sentence case, no dot glyph separators, limits written the same way.
8. **Quiet**: a page description only where it adds something the page doesn't show, no card subtitle restating its
   title, no paragraph under a next step, a notice only while its state stands and with the action that deals with
   it (Alerts have no dismiss button), definitions in info tips
   ([Content and disclosure](design-spec.md#content-and-disclosure)).
9. **Optional marked**: every item the specs list as Proposed carries the Optional marker, and nothing else does
   ([Optional marker](design-spec.md#optional-marker)).
10. **One place per action**: a record's step actions only in its next step card (the docked bar on a phone); the
    header holds downloads, record-level actions and ⋯, last.
11. **Info tips**: each has its text, adds something the screen doesn't show, and a screen has five at most.
