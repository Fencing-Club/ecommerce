# Design spec: foundations, shell and patterns

Part of the [app redesign spec](README.md). The rules every authenticated page follows. The workspace pages
([buyer](buyer.md), [supplier](supplier.md), [forwarder](forwarder.md)) and [Settings](settings.md) apply them. Numbers
like (F4) point at the [findings](information-architecture.md#findings).

## Principles

1. **Do, then report.** Every workspace opens on what needs someone now. Analytics are one click away, not in the way.
2. **One object, one name, one address.** A record has the same name in every workspace and a URL that means the same
   thing wherever it's opened. Labels change by viewpoint only when the object is genuinely seen from the other side,
   and then the record says so ("From Harbor Goods").
3. **The lifecycle is always visible.** A purchase order and a shipment show where they are, who has the ball and the
   one action that moves them on.
4. **Every record has a page.** Anything that can be searched for, linked to or talked about gets a route, a history and
   a place in search. Sheets and dialogs are for quick edits to a record that already has a page.
5. **Same job, same pattern.** Lists, records, editors and settings each have one template, one save model and one set
   of states.
6. **Permissions shape, never surprise.** What someone can't use isn't shown; what they can see but not change is
   marked View only once, at the top.

## Visual foundations

The redesign keeps Copacker's brand and shadcn/ui on Base UI (`base-nova`). Tokens stay in `src/styles/theme.css.ts`.

| Token                  | Value (light)                   | Use                                                                     |
| ---------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `primary`              | `#C2410C` (oklch 0.553 0.195 38.4) | One primary action per view, the active nav item's marker, links     |
| `background`           | `#FFFFFF`                       | Page                                                                    |
| `sidebar`              | `#FAFAFA`                       | Sidebar and settings navigation                                         |
| `muted`                | `#F5F5F5`                       | Table header band, inactive segments                                   |
| `border`               | `#E5E5E5`                       | Card and table rules                                                    |
| `foreground`           | `#0A0A0A`                       | Text                                                                    |
| `muted-foreground`     | `#737373`                       | Secondary text, never below 12 px                                       |
| `info` (new name for `chart-1`) | `#2A78D6`              | In progress statuses                                                    |
| `success`              | `#006300`                       | Done statuses                                                           |
| `warning`              | `#FAB219`                       | Needs action; text on it is `foreground`, never white                   |
| `destructive`          | `#DC2626`                       | Failed, lost, delete                                                    |
| Workspace kind accents | Buyer `#C2410C`, Supplier `#0F766E`, Forwarder `#4338CA` | The switcher's kind chip only. Never on actions. |

- **Type:** Geist Sans, Geist Mono for SKUs, references and tracking numbers. Page title 24/32 semibold, section
  title 16/24 semibold, body 14/20, meta 12/16. Numbers are tabular.
- **Spacing:** a 4 px grid. Page padding 32 px on desktop, 16 px on a phone. 24 px between a page's blocks, 16 px
  inside cards.
- **Radius:** 10 px cards, 8 px controls, full pills for statuses.
- **Elevation:** borders, not shadows. Shadows only on overlays (menus, sheets, dialogs, the action bar).

## The shell

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [Workspace ▾]           [ Search  Ctrl K ]                  [+ Create] [Inbox 3] [AR ▾]  │  56 px
├──────────────┬───────────────────────────────────────────────────────────────────────────┤
│ Home         │  Breadcrumb                                                               │
│ Inbox     3  │  Title  Status                                    [Secondary] [Primary]   │
│              │  ─────────────────────────────────────────────────────────────────────── │
│ GROUP        │                                                                           │
│ Page         │  Page content, max 1280 px, left aligned                                  │
│ Page      12 │                                                                           │
│ ...          │                                                                           │
│              │                                                                           │
│ Settings     │                                                                           │
└──────────────┴───────────────────────────────────────────────────────────────────────────┘
   240 px
```

### Top bar

- **Workspace switcher (left).** Replaces the logo-only corner and the sidebar's switcher (F2). Shows the Copacker mark,
  the workspace's name and a kind chip (Buyer, Supplier or Forwarder). The menu lists workspaces with their kind,
  **New workspace** and **Workspace settings**. Switching reloads, as `WorkspaceWatch` requires today. On a phone the
  kind chip moves into the workspace menu, so long workspace names fit.
- **Search (center).** The existing command menu, unchanged in behavior. Result groups follow the renamed objects
  (Sales orders, Products, Purchase orders, Shipments, Partners or Customers). Adds **Actions** ("Create purchase
  order", "Invite a supplier") above results when the query matches one.
- **Create (right).** A primary-outline button with the kind's create actions. Buyer: Purchase order, Import purchase
  order, Supplier, Forwarder. Supplier: Product, Catalog, Import products. Forwarder: hidden. Each item respects Edit
  access; with none, the button is hidden.
- **Inbox (right).** Replaces the empty bell (F9). A count of open tasks, and a popover with the latest five and "View
  all" to `/inbox`. See [Inbox](#inbox).
- **Account (right).** Avatar menu: name and email, **Account settings**, Theme (Light, Dark, System), Keyboard
  shortcuts, Help, **Sign out**. Moves out of the sidebar's footer.

### Sidebar

- 240 px, `sidebar` background, collapses to a 56 px icon rail (Ctrl+B) that shows labels in tooltips, and becomes a
  sheet under 768 px.
- **Home** and **Inbox** first, ungrouped, then the kind's groups, then **Settings** pinned at the bottom.
- An item shows a count only for work waiting on this workspace (Inbox tasks, Purchase orders needing a reply,
  Orders to pack, Shipments needing action). Counts are never totals.
- The active item has a `muted` fill and a 2 px `primary` marker on its leading edge.
- Record pages keep their L1 item active (a PO keeps Purchase orders active).

### Page header

One component for every page, replacing `PageHeader`:

- Breadcrumb on its own row above the title for L2 and deeper pages; L1 pages have none.
- Title, then a status badge for records, then a **View only** badge when the person can't edit this page.
- Actions right-aligned: at most one primary, up to two secondary, then ⋯, always last. On a record page the header
  holds only record-level actions (downloads, **Edit**, **Propose changes**) and ⋯; the step's own actions live in
  the [next step card](#next-step-card), never in both places. On a phone, the next step's actions move to the docked
  action bar and record-level actions into ⋯.
- An optional **meta row** under the title for records: counterparty, key dates and references, as separate text
  elements with space between them, never joined by a dot glyph.
- Optional **tabs** under the header for records and index views.

## Page templates

Every page is one of five templates.

### 1. Home

Task queue and a pipeline for the workspace kind, described per kind. No money unless the person sees prices.

### 2. Index (list)

```text
Title                                                        [Secondary] [Primary]
[Saved view (count)] [View (count)] [View (count)] ...
[Search          ] [Filter chips ...]                  [⇅ Required by] [Columns] [Export]
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ☐ Reference ▲      Counterparty      Route / detail      Date       Amount   Status  ⋯ │
│ ☐ PO-1045          Lotus Mfg         → Oakland           Sep 24     $2,958   ● ...   ⋯ │
└────────────────────────────────────────────────────────────────────────────────────────┘
Showing 1–25 of 132 purchase orders                                                [‹] [›]
```

- **Views, not stat cards (F6).** Tabs are saved views with counts in the tab. The stat cards on Purchase orders and
  Shipments go. The URL holds the view, search, filters and sort, so any list state is a link.
- **Filter bar:** search on the left, filter chips for the list's facets (status, partner, destination, date), sort,
  column visibility and export where there is one. Sort is one control: an up-down arrow and the current order
  ("Required by", "Newest first"), no chevron. Subsets of a list are views; a segmented control only switches how the
  same data displays (Map and List, a chart's grouping).
- **Pagination:** "Showing 1–25 of 132 purchase orders" with previous and next when the list spans pages; a plain
  count ("9 partners") when everything fits. No page numbers, and no count that repeats the view's name.
- **Table:** the `Table` component with its frame. The whole row opens the record (`LinkRow`). Row selection appears
  only where bulk actions exist (archive products, export, set catalog). Per-row actions in a trailing ⋯.
- **Empty states:** the first-run empty state names the one step that comes next (as Purchase orders does today); an
  empty filter result says "No matches" with **Clear filters**.
- **Phone:** rows stack to primary text, secondary text and the status, as Orders and Restock already do.

### 3. Record

```text
Purchase orders ›
PO-1045  ● Approve invoice                                      [Download PDF] [⋯]
From Lotus Manufacturing   To Amazon FBA and AWD US via Bayline Freight
[Stage ── Stage ── Stage ── Stage ── Stage]                               (lifecycle)
┌ Next step ───────────────────────────────────────────────────────────────────────────┐
│ Your next step: Approve the invoice for shipment 1        [Secondary] [Primary]      │
└──────────────────────────────────────────────────────────────────────────────────────┘
[Items] [Shipments 2] [Documents 5] [Activity 12]
┌ main (fluid) ─────────────────────────────┐ ┌ rail (320 px) ──────────┐
│                                            │ │ Summary                 │
│                                            │ │ Details                 │
└────────────────────────────────────────────┘ └─────────────────────────┘
```

- **Lifecycle tracker** under the meta row: the record's stages, done, current and upcoming, with the date each was
  reached. Branches (correction, cancelled, needs attention) show as the current stage's tone.
- **Next step card** (F4): one sentence from the workflow step for this viewer, who has the ball, and the action that
  moves it on. It replaces the scattered alerts ("Changes waiting", "Creating", "Packet ready", "Off Copacker"). With
  nothing to do, it says who's next, or is left out when the record is done.
- **Tabs** for records with more than one kind of child. The first tab is the record itself. Activity holds the
  timeline and comments. A tab's count shows only when it's more than zero.
- **Rail** for the record's summary and editable details. It stacks under the main column below 1024 px.

### 4. Editor and task flow

For creating or changing something in several parts: the PO builder, propose changes, packing, product, catalog,
import review.

```text
Purchase orders › PO-1045 ›
Pack shipment 2                                                          [Save draft] [×]
┌ Steps ─────────┐ ┌ Section ─────────────────────────────────────────────────────────┐
│ ✓ Invoice      │ │                                                                   │
│ ● Contents     │ │                                                                   │
│ ○ Cartons      │ │                                                                   │
│ ○ Pickup       │ └───────────────────────────────────────────────────────────────────┘
│ ○ Review       │
└────────────────┘
┌ Action bar ─────────────────────────────────────────────────────────────────────────┐
│ 12 cartons, 420 units   2 problems                          [Check]  [Submit packing list] │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **One save model (F10).** Every editor keeps changes as a draft and commits them through the
  [action bar](#action-bar). Leaving with changes asks first. Settings pages use the same bar instead of a Save per
  card.
- **Step list** on the left for flows with ordered parts (packing, import review, PO builder), each step showing done,
  current or has problems. Steps are anchors on one page, not separate pages, so everything stays reviewable.
- **Validation** shows inline under the field and as a count in the action bar that jumps to the first problem.

### 5. Settings

Its own navigation, described in [Settings](settings.md).

## Shared patterns

Each pattern below is one component in the kit (`Redesign — Kit` on the canvas), used everywhere it appears. The full
inventory, including icon buttons, checkboxes and switches, and the tokens every color comes from, is in
[Consistency](consistency.md). An audit
of the first round of screens found the action bar in three styles, the lifecycle tracker and the next step card in
three builds each, and segmented controls at four heights; they're now single components.

### Action bar

**RD Action Bar** is the only bar for committing or acting on a page: unsaved changes, task flows (packing, new PO,
propose changes, import), proposal review and bulk selection. It replaces the edge-to-edge white bars, the dark
settings bar and the dark bulk bar.

- **Anatomy:** a lead icon in a tinted tile, a title and a one-line detail, an optional problems pill that jumps to
  the first problem, then actions: **Discard** as a quiet text button, up to three secondary buttons, one primary,
  and a close button for bulk selection.
- **Placement:** floating over the content column, 24 px from the bottom of the window, as wide as the column, with a
  border and a soft shadow. It never spans the sidebar.
- **When it shows:** for unsaved changes, only once something changes. For a task flow or a proposal, always, because
  it holds the flow's running summary and its commit action. For bulk actions, while rows are selected.
- **Lead tone:** warning for unsaved changes, neutral for a flow's summary or a selection, info for a proposal to
  review, destructive when submitting is blocked.
- **Phone:** docked to the bottom edge, full width, no radius; the lead icon hides, the message sits above the
  actions, and the primary action fills the remaining width. On a record page it carries only the next step's actions,
  with no message.

### Lifecycle tracker

**RD Lifecycle Stage** in a row: a bar, an icon and the stage's name, and a date or state under it. Stages are done
(success green), current (info blue: someone is working on it), needs attention (warning amber: the viewer's move) or
upcoming (border gray), the same meanings the status tones use. The bars keep working at any width,
which is why they replaced the circle steppers. On a phone the row becomes a compact card: "Step 3 of 6", the current
stage and its date, the segments, and **All stages**, which expands a vertical list.

Under each stage: the date it was reached, a count or planned date ("1 of 2 shipments", "Pickup planned Oct 2"), or
"Waiting on you" when the viewer must act. An upcoming stage with no planned date shows nothing; its gray bar already
says it hasn't started.

A shipment's stages follow its route and who arranges shipping, as the
[purchase order flow spec](../purchase-order-flow/README.md) sets out:

- **Labels** only when the buyer arranges shipping. The supplier's carrier or the forwarder brings its own.
- **Booking** for Amazon Global Logistics, which waits for the booking number.
- **Delivery request** and **Carton labels** for Amazon's warehouses in China (GWD).
- **At the forwarder** and **Shipped onward** through a forwarder, and **Open**, **Amazon shipment**, **Labels** and
  **Departed** on a combined shipment.
- **Receiving** before **Received**, and **Accepted** (or a Declined branch) on the PO.

### Next step card

**RD Next Step**: a lead icon, an eyebrow ("Your next step", or "Waiting on Lotus Manufacturing" in the quiet tone), the
title, a detail line, an optional warning line, an optional meta (days left, window) and the step's actions, at most
a secondary and a primary. A waiting card (quiet tone) has no primary; it may keep one secondary that opens where the
other party works (**Open in Seller Central**). On a phone the card keeps its eyebrow, title and meta, and its actions
move to the docked action bar.

When the next move happens in Amazon (booking Global Logistics, a GWD delivery request, tracking numbers, a case for
missing units), the card names it and its secondary action opens Seller Central.

### Packing requirements

The rules a supplier must follow for where the goods go, shown before packing starts and checked while packing. They
come from `packages/aisle/src/requirements.ts` (`destinationRequirements`, `itemRequirements`), which today states each
network's carton rule as one line; the redesign groups them per destination into **Cartons** (mixing, size, weight,
units per carton, trucks), **Each unit** (labels, preparation), and **Each carton** (carton labels), following the
[purchase order flow spec's rules](../purchase-order-flow/README.md#one-order-several-destinations).

| Destination    | Cartons                                                                  | Each unit                                   | Each carton                                                |
| -------------- | ------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------- |
| FBA            | Mixed SKUs allowed if they fit one packing group; up to 63.5 cm a side and 22.68 kg unless one unit is larger | FNSKU label covering other barcodes; Amazon's prep, such as a suffocation warning on polybags | Amazon's carton label once the buyer releases labels |
| AWD US         | One SKU per carton; at most 150 units; every carton of a SKU packed the same way; 63.5 cm and 22.68 kg; never shares a trailer with FBA freight | FNSKU label covering other barcodes         | Amazon's SSCC carton label once the buyer releases labels  |
| Your warehouse | Mixed SKUs; no size, weight or unit limits                               | A SKU label only for products set to get one; your instructions | None                                            |
| GWD            | Its rules still need checking; it gets a column when they're known       |                                             |                                                            |

- Shipping labels aren't a destination rule. They come from whoever arranges shipping, and the buyer uploads them only
  when it arranges shipping itself.
- A PO whose lines go to more than one destination says so first: pack each destination in separate cartons, and each
  ships as its own shipment. With three destinations the card lists them as rows.
- Where they show: the supplier's order page (Items tab, above the buyer's note), the Pack shipment flow's Cartons step
  as live checks with the carton that breaks each rule, the PO PDF and packing checklist (as today), and the buyer's PO
  builder, which says the rules are added automatically. The buyer confirms them before sending an order with several
  destinations or any AWD line.
- Prohibitions ("One SKU per carton") use the destructive tone and bold text; limits and labels are neutral.

### Status

`Status` and `StatusBadge` stay the only way to show a status: a tinted pill with a dot, in five tones. The redesign
fixes which tone each status takes, and names statuses from the viewer's side where the sides differ.

The full label list, one tone each, is in [Consistency](consistency.md#statuses): warning when the viewer has to act,
info while someone else is working, success when something is ready, neutral when idle or filed, destructive when it
failed. A count label ("4 to reorder", "1 out of stock") takes its base label's tone.

### Tasks

A task is something a person in this workspace can do now to move a record on. The same task source feeds the Inbox,
Home and the sidebar counts, so they always agree. Tasks come from the workflow steps and the existing attention
queries (`overview.attention`, supplier `tasks`), filtered by what the person can open.

| Kind      | Examples                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------- |
| Buyer     | Approve invoice changes, Review proposed changes, Answer a declined order, Send draft, Upload shipping labels (only when you arrange shipping), Release labels (also to a forwarder for a combined shipment), Enter a Global Logistics booking number, Link a GWD delivery request, Receive shipment, Close a received PO, Retry failed Amazon shipment, Reorder due, Store needs reconnecting, Link listings |
| Supplier  | Accept order, Pack order, Fix packing problems, Print labels and mark shipped, Enter carrier and tracking (when it arranges shipping), Answer declined changes, Short stock, Products without a price, Customer without a catalog |
| Forwarder | Record arrival, Combine shipments, Ship onward, Add tracking                                     |

### Inbox

`/inbox`, for every kind. Two tabs:

- **To do:** open tasks, grouped by due or by record, each with its record, who's waiting and the action. Done tasks
  leave by themselves when the record moves on.
- **Updates:** events on records the person follows (created, sent, commented on or assigned to them): comments,
  sent POs, proposals, shipments created, received. Mark read, mark all read.

Updates are delivered by Novu, as [App header](../../app-header.md) plans; Copacker supplies the events and doesn't
build a notification engine. To do is computed by Copacker and works before Novu arrives.

### Money and prices

- A person without **See prices and costs** never sees an amount, and the layout doesn't leave a hole: columns and
  cards are left out, and rails reflow.
- Currencies show with their code when a page mixes them (`€1,200.00 EUR`). Totals in the reporting currency say so.

### Documents

One **Documents** component on every record: grouped by the record and each child, with type, file name, who added it
and when, download, and replace where the person can. Downloads stay behind authorized routes.

- The commercial invoice is the one Copacker makes from the packing list, with customs details on overseas routes;
  the supplier can upload its own instead.
- A shipment has a slot for bills of lading once the goods leave origin. Whoever handles customs uploads them, several
  are allowed, and nothing waits for them.
- A Global Logistics shipment adds the booking sheet, and a GWD shipment adds the carton labels from its delivery
  request.

### Optional marker

**RD Optional** marks an item the purchase order flow spec only proposes: the Incoterm field, Amazon's partnered
carrier, the delivery window from the expected arrival, tracking sent to Amazon, prep categories set through Amazon,
HS codes and unit weights from Shopify, the ISF draft, the pickup phone rule and forwarder emails. The screens draw it
where it would go; it's built once it's decided. It's a designer's annotation, not product UI.

### Activity

The PO timeline becomes the **Activity** tab on every shared record (PO, shipment, partner, customer, product). Comments
at the top, then events by day, each naming the person and workspace. Mentions notify through the Inbox.

### Dialogs, sheets and pages

- **Dialog:** a confirmation, or a form of up to four rows of fields (Ship onward, Mark shipped, Add landed cost). One
  construction: a title row with a close button, the body, then **Cancel** and the primary on the right; 12 px radius,
  a border and the overlay shadow. The primary answers the title with its verb ("Close PO-1040?" is answered by **Close
  purchase order**, "Submit packing list?" by **Submit**). On a phone the same content opens as a sheet.
- **Sheet:** a quick edit to a record from a list, which also has its own page (edit a partner's contact from the
  Partners list).
- **Page:** anything with its own history, children or more than one section.

## States

| State        | Treatment                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Loading      | Skeletons in the shape of the page's template; the header and tabs render at once                          |
| First run    | Empty state naming the next step, with its action for someone who can take it, or who to ask               |
| No matches   | "No matches", the filters in words, **Clear filters**                                                      |
| View only    | A View only badge in the header; controls hidden, not disabled; values read as text                       |
| No access    | The existing No access page, in the shell, naming the page and who to ask (the workspace's admins)         |
| Error        | An inline alert in the part that failed with **Try again**; the rest of the page still works               |
| Working      | Long jobs (Amazon shipment creation, syncs) show progress in the Next step card and refresh by themselves  |
| Disconnected | A store needing reconnection shows once, as a banner under the top bar, to everyone, with the admin's action |

## Permissions in the layout

- Pages a member lacks aren't in the sidebar, search, Create menu or Home, as today.
- A link to a page someone can't open renders as plain text (`PageLink`).
- Admin-only controls render through `ForAdmins`. Settings sections a member can't change show their values read-only.
- Prices follow [Money and prices](#money-and-prices).
- **Home is open to everyone** in the workspace. Its money blocks need prices. This fixes members without prices
  losing their attention list with the Overview (F5).

## Responsive

| Width          | Layout                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------- |
| ≥ 1280 px      | Sidebar, content up to 1280 px, record rail 320 px                                                  |
| 1024–1279 px   | Sidebar collapses to the icon rail by default                                                       |
| 768–1023 px    | Rail stacks under the main column; tables hide their secondary columns with container queries       |
| < 768 px       | Sidebar as a sheet from a menu button in the top bar; search becomes an icon; rows stack; the primary action is a sticky bottom bar |

Packing and receiving are designed tablet-first (portrait 820 px): large tap targets (44 px), carton rows as cards,
and scanning a barcode into a carton's SKU field.

### Horizontal visualizations on a phone

Every component that reads left to right has a phone form, and every page that uses one has a phone design on the
canvas (`Redesign — Mobile`).

| Component                          | Desktop                                   | Phone (< 768 px)                                                                 |
| ---------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| Pipeline (Home, every kind)        | Stage tiles in a row with arrows          | A vertical stage list: dot, name, count, a share bar and units, each row a link   |
| Lifecycle tracker (PO, shipment, leg) | Stage bars in a row                    | Compact card with "Step n of m", the current stage, segments and **All stages**   |
| Step list (task flows)             | A column on the left                      | A progress card on top: step name, segments with each step's state, previous and next |
| KPI strip (Analytics)              | One row of four                           | A 2 by 2 grid                                                                    |
| Route bars (Lead times)            | Label, bar on a shared axis, total        | Each route stacks: name and total, then a full-width bar, then shipments; no axis |
| Estimate timeline (Lead times)     | Milestones left to right                  | A vertical timeline with each handoff's days between milestones                   |
| Split and stacked bars             | Beside the name                           | Full width under the name, with the legend in two columns                          |
| Time charts (Analytics)            | Up to a quarter by day                    | At most 30 bars (else weeks), three axis labels, tap a bar for its values         |
| Filter bar and tabs                | One row                                   | Scroll sideways inside the row; the active tab stays in view                      |
| Tables and record rails            | Columns and a right rail                  | Rows stack (see Tables); rail sections become collapsible rows after the content  |
| Action bar                         | Floating over the column                  | Docked to the bottom edge                                                        |

Between 768 and 1023 px, pipelines keep their row up to four stages and wrap into two rows of three beyond that;
lifecycle trackers keep their bars but show dates only for the current stage.

## Accessibility

- Every page has one `h1` (the title); sections use `h2`; skip link to `#main-content` stays.
- Tabs are links with `aria-current="page"` when they change the URL, and `role="tablist"` only when they don't.
- The lifecycle tracker is an ordered list with each stage's state in text ("Done", "Current", "Not started").
- Status is never only color: every pill has its label, and the dot is decorative.
- Counts in the sidebar are read with their meaning ("Purchase orders, 3 need a reply").
- Focus returns to the invoking control when a dialog or sheet closes; the action bar is announced politely once.
- Contrast: text on `warning` uses `foreground`; `muted-foreground` stays on white or `muted` only.

## Content and disclosure

A first review found the screens text heavy: page subtitles restating titles, card subtitles defining terms, a
paragraph under every next step, requirement text repeated on every line, and notices that couldn't be dismissed. That
is a cognitive accessibility problem as much as a visual one. Every screen follows these rules.

**Show only what the task needs now.**

- No page subtitles. The title, the breadcrumb and the meta row say what the page is. A state that matters ("Draft
  saved 2 minutes ago") goes in the meta row.
- No card subtitles that restate the title. A short scope stays ("Aug 30 to Sep 28", "8 tasks, 2 urgent").
- The meta row under a record's title says who and where (counterparty, route). Dates, terms and totals live in the
  rail, once.
- One secondary line per row, at most. A fact that would repeat on every row ("Packed for FBA") is a short tag, and
  rules that apply to the whole record live in one place on the record.
- Rows that would only say "not yet" ("Created on approval", "Not booked") are left out until they have a value.
- Identical rows are grouped (cartons 1 to 6, 20 each), as the packing list already does.

**Move the rest to where it's needed.**

| Kind of information                          | Where it goes                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| A definition ("Production runs from…")       | **RD Info Tip** beside the label or title; the text shows in **RD Tooltip** on hover or focus |
| A long list of rules or details              | A summary (the 3 key rules as chips) and **Show all** to expand                 |
| What happens after an action                 | The action's **confirm dialog** ("Submit packing list?" lists the next steps)    |
| A consequence of one choice                  | Next to that choice only (a checkbox label), not as a paragraph                 |
| A suggestion ("Use the measured 41 days")    | An inline link in the row it's about, not a banner                              |
| A chart's reading aid                        | A legend entry, not a footnote                                                  |
| Keyboard or gesture hints                    | The command menu footer only                                                    |
| Steps that follow one choice                 | The confirm dialog for that choice (switching eBay quantities to Copacker lists what to turn off first) |

**Info tips** follow Fluent's info label guidance: supplemental definitions only, in one or two short sentences with a
period after full sentences, never repeating a visible label or value. Anything needed to finish the task stays
visible. At most five on a screen; a role or option that already has a visible description gets none. In the canvas
the text is the instance's name after "Info Tip: ".

**Notices.**

- **RD Banner** is the only notice: one line, an optional action, and a dismiss button. Dismissing hides it for that
  person until the state changes.
- At most one banner per page, above the content. Only a blocking error (a store disconnected, a failed Amazon
  shipment) may drop the dismiss button, and it must carry the action that fixes it.
- Validation stays inline next to the field or row it's about, and counts in the action bar.
- Informational notes ("Tasks leave by themselves when…", "Members see these details read-only…") are removed; the
  interface shows that behavior instead (View only badge, tasks disappearing).

**Next step card:** the eyebrow, one title line and the action. Supporting facts go in its meta ("48 days left"),
the action's confirm dialog, or an alert line when something blocks the step.

## Copy

- Short and literal. Prefer a number or a noun phrase to a sentence: "35-day lead time", "5 orders", "No catalog match".
- Sentence case everywhere. Actions are verbs ("Approve changes", "Mark shipped").
- Never use `·`, `•` or another dot glyph as a separator. Use layout or words.
- Every new or changed string goes through the Fluent Agent MCP before it ships, per the repository's rules.
