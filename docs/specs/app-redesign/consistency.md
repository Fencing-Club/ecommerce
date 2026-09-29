# Consistency: one source for every concept

Part of the [app redesign spec](README.md). The first round of screens was drawn by several designers in parallel, and
the same concept came out in different shapes: three action bar styles across 12 bars, three lifecycle trackers, three
next step cards, segmented controls at four heights, icon buttons at five sizes. This page records the audit of every
screen on the canvas (56 desktop and phone screens), what was fixed, and the rules that keep it from happening again.

## The rule

A concept that appears on more than one screen is a **component in the kit** (`Redesign — Kit`) or a **token**, and
screens use it; they never redraw it. A screen may override an instance's content, state and size, not its styling.
When a concept needs a new shape, change the component, so every screen moves together.

## Components

| Concept                  | Component             | Sizes and states                                                                 | Used for                                                    |
| ------------------------ | --------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| App header               | RD Top Bar            | Workspace name and kind chip, inbox count                                        | Every desktop screen                                        |
| Phone header             | RD Mobile Top Bar     | Workspace name, inbox count; kind chip hidden                                    | Every phone screen                                          |
| Navigation item          | RD Nav Item           | Default, active (fill and marker), count                                         | Sidebars and the settings navigation                        |
| Status                   | RD Status             | Five tones, below                                                                | Every status and state label                                |
| Button                   | RD Button             | Primary; icon optional                                                           | The one primary action in a view                            |
| Secondary button         | RD Button Secondary   | Icon optional; full width in lists (Add carton)                                  | Everything else that's a button with a label                |
| Icon button              | RD Icon Button        | 34 px (pointer), 44 px (touch: phones and packing), 28 px quiet (row menus)      | ⋯ menus, close, columns, pagination, duplicate, remove      |
| Tab                      | RD Tab                | Default, active, count                                                           | Views on lists, tabs on records                             |
| Checkbox                 | RD Checkbox           | 16 px (pointer), 20 px (touch); unchecked, checked                               | Row selection, options                                      |
| Switch                   | RD Switch             | 32 by 18 px; off, on                                                             | Settings, inventory tracking, catalog options               |
| Action bar               | RD Action Bar         | Floating (desktop), docked (phone); lead tones; problems; 3 secondary slots       | Unsaved changes, task flows, proposals, bulk selection      |
| Lifecycle stage          | RD Lifecycle Stage    | Done, current, needs attention, upcoming                                         | Record lifecycle trackers on desktop                        |
| Lifecycle, compact       | RD Lifecycle Compact  | Up to 8 stages; collapsed or expanded                                            | Record lifecycle trackers on a phone                        |
| Next step                | RD Next Step          | Your move (warm) or waiting (quiet); alert, meta, 2 actions; no detail paragraph  | Every PO, shipment and leg                                   |
| Banner                   | RD Banner             | Warning, info or destructive; one line, action, dismiss                          | The only notice on a page, at most one                       |
| Info tip                 | RD Info Tip           | 14 px info icon; tooltip text in its metadata                                    | Definitions beside labels, card titles and column headers    |
| Tooltip                  | RD Tooltip            | Dark bubble, 260 px                                                              | What an info tip reveals on hover or focus                   |

Patterns built from these, with one construction each: page header, filter bar (search field and filter chips at
34 px), cards (10 px radius, 15/600 title, 14 by 16 header padding), tables (header band `muted`, 9 by 16 padding,
12/500 labels), segmented controls (32 px, 3 px inset, 26 px segments), packing requirements card, pipeline (row on
desktop, stage list on a phone), KPI strip (row on desktop, 2 by 2 on a phone).

Still drawn once each, and to become components when a second screen needs them: the Mark shipped dialog (desktop) and
sheet (phone), the role radio cards (Member access), the command menu.

## Tokens

Every color on a screen is a variable. New in this audit:

| Token                                        | Use                                                        |
| -------------------------------------------- | ---------------------------------------------------------- |
| `rd-primary-tint`, `rd-primary-border`       | The "your move" next step card                              |
| `rd-kind-supplier-soft`, `rd-kind-forwarder-soft` | Kind chips and avatars for supplier and forwarder     |
| `rd-warning-border`, `rd-danger-border`      | Borders of warning banners and danger zones                |
| `rd-warning-tint`, `rd-danger-tint`, `rd-success-tint` | Row highlights: changed, failing, added          |
| `rd-fg-disabled`, `rd-border-strong`         | Disabled text and icons; checkbox and switch outlines       |
| `rd-chart-1`, `rd-chart-1-soft`, `rd-chart-2`, `rd-chart-3`, `rd-chart-muted` | Charts and channel shares        |
| `rd-handoff-pickup`, `rd-handoff-forwarder-soft`, `rd-on-light-info` | Lead time handoff bars and their labels |
| `rd-scrim`                                   | Behind dialogs and sheets                                  |

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
| Neutral     | Draft, Closed, Archived, Received, Expected, Paused, Not invited, Not connected, Unchanged                     |
| Info        | With supplier, Packing, In transit, Shipped on, In progress, Invited, Unfulfilled, Updated                     |
| Success     | Ready for pickup, Delivered, Fulfilled, Active, In stock, On Copacker, Connected, Up to date, New, Added       |
| Warning     | To pack, Approval needed, Approve invoice, Changes proposed, Changes declined, Needs shipping labels, At warehouse, Needs label, Awaiting price, Reorder soon, Invitation expired, Needs reconnecting, Changed |
| Destructive | Needs attention, Cancelled, Out of stock, Reorder now, Authorization expired, Removed                          |

"To pack" moved from info to warning in this audit: it's the supplier's own move.

Progress indicators use the same meanings: lifecycle stages and step lists are **green** when done, **blue** when
current, **amber** when they need the viewer and **gray** when upcoming. Black is never a state. Categories, such as the
FBA and AWD US network tags, are neutral gray tags, never colored like a status.

## Canonical scenario data

Every screen tells one story. Before adding a screen, reuse these facts.

| Fact                       | Value                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Today                      | Monday, September 28, 2026. Future dates carry 2026.                                                    |
| Buyer                      | Harbor Goods; Alex Rivera, Purchasing lead (owner)                                                      |
| Supplier                   | Lotus Manufacturing, Dongguan, China; Mei Chen                                                          |
| Other partners             | Northwind Textiles (Ningbo), Cedar Works; forwarders Bayline Freight (Oakland), Pacific Consolidators   |
| PO-1045                    | 420 units, $2,958.00, required by Nov 15, ready Oct 2, Net 30, via Bayline Freight to Amazon FBA ONT8 and AWD US |
| PO-1045 lines              | Canvas tote bag, Natural (HG-TOTE-NAT, LM-CT-NAT), 200 at $5.40, FBA; Linen apron, Sage (HG-APRON-SG, LM-LA-SAG), 120 at $8.90, FBA; Market basket, Large (HG-BASKET-L, LM-MB-L), 100 at $8.10, AWD US |
| PO-1045 proposal           | Revision 2: totes to 240, apron to $9.40, large basket replaced by medium (HG-BASKET-M, LM-MB-M) 120 at $6.95; 480 units, $3,258.00 |
| Shipment 1                 | 12 cartons, 240 units (180 totes, 60 aprons), invoice INV-LM-2291 for $2,016.00, carton 7 at 23.4 kg    |
| Forwarder's shipment 2     | 12 cartons, 290 units, 186.4 kg, 0.83 m³, carrier Matson                                                |
| Amazon carton limit        | 63.5 cm a side and 22.68 kg (50 lb); written as 22.68 kg                                                 |
| Sidebar counts             | Buyer: Inbox 8, Purchase orders 3, Shipments 3, Restock 4. Supplier: Inbox 6, Orders 5, Shipments 2, Inventory 5. Forwarder: Inbox 5, Shipments 2 |

Product photos: within a workspace, one image per product (the buyer's come from Shopify, the supplier's from its own
catalog, so they can differ between workspaces).

## What the audit fixed

| Finding                                                                 | Fix                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 12 action bars in 3 styles                                              | RD Action Bar everywhere                                            |
| Lifecycle trackers and next step cards in 3 builds each                 | RD Lifecycle Stage and RD Next Step; phone trackers RD Lifecycle Compact |
| Segmented controls at 29, 32, 33 and 34 px                              | 32 px everywhere                                                    |
| 71 icon buttons at 30, 32, 34, 36 and 44 px, hand-drawn                 | RD Icon Button at 34, 44 or quiet 28                                 |
| 40 checkboxes and 19 switches in two sizes each                         | RD Checkbox and RD Switch                                           |
| About 40 literal colors, including two light blues for one chart and two supplier tints | Tokens above; only logos and swatches stay literal    |
| Top bar kind chips tinted differently by each designer                  | Kind soft tokens                                                    |
| Sidebar and inbox counts disagreeing between screens (Inbox 5 against "8 tasks") | Canonical counts on 147 nav items and 54 top bars           |
| PO-1045 with different products on the buyer's and supplier's screens   | Canonical lines, proposal and shipment contents; buyer photos matched |
| Years 2025 and 2026 mixed; Lotus in Yiwu and Dongguan; Alex's title     | Canonical facts above                                               |
| "23 kg" and "50 lb" limits                                              | 22.68 kg                                                            |
| "To pack" in the info tone                                              | Warning                                                             |
| Buyer's PO without the packing requirements the spec promises           | Card added, read-only                                               |
| Phone screens missing for pages with trackers                           | Proposal review and Mark shipped (sheet) added; 13 phone screens    |
| One table header without the header band                                | Fixed (Pack shipment cartons)                                       |
| Text-heavy screens: about 104 sentence-length texts, notices that couldn’t be dismissed | Content and disclosure rules; 14 remain; 29 info tips; 4 banners, all dismissible |
| Black used for done stages and step markers; network tags colored like states | Green, blue, amber, gray progress; neutral tags            |
| Forwarder leg listing a product not on PO-1045; 12 identical carton rows | Canonical contents, grouped carton ranges                           |

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
8. **Quiet**: no page subtitles, no card subtitle restating its title, no paragraph under a next step, no notice
   without a dismiss button except a blocking error, definitions in info tips
   ([Content and disclosure](design-spec.md#content-and-disclosure)).
