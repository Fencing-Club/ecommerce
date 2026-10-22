# Styling

Copacker uses [shadcn/ui](https://ui.shadcn.com) components styled with [Tailwind CSS](https://tailwindcss.com) v4.
[vanilla-extract](https://vanilla-extract.style) holds the theme tokens, and nothing else.

- **Shared components** under `apps/copacker/src/components/ui` are shadcn's own source on Base UI (style
  `base-nova`), added with the shadcn CLI and styled with Tailwind classes. Add one from `apps/copacker` with
  `pnpm dlx shadcn@latest add <component>`. Edit them like any other code: the frame and header band on `Table` are
  ours. `components.json` sets `rsc: false` and `rtl: true`, so an added component comes without `"use client"` and
  with logical classes (`ms-`, `ps-`, `start-`).
- **New UI** uses Tailwind classes, shadcn components and their conventions: `data-slot`, `cn()` from `@/lib/utils`,
  `cva` for variants. Import a kit component as `@/components/ui/<name>`, never by a relative path.
- **Reset:** Tailwind's preflight. `globals.css` adds the few base rules it leaves out: the body's full height and font
  smoothing, and the pointer on buttons.

## Theme

Colors keep shadcn's names (`primary`, `muted-foreground`, `chart-1`, plus `success`, `warning` and `info`). Their light
and dark values live once, in `src/styles/theme.css.ts`, which sets the CSS variables on `:root` and `.dark`.
`src/app/globals.css` maps those variables into Tailwind's theme (`bg-primary`, `text-muted-foreground`,
`text-success`), so both systems read the same tokens. Change a color in `theme.css.ts` only.

- `info` is in-progress blue, for statuses and current stages; `chart-*` are chart series only.
- `warning-foreground` is text and icons on a warning surface, where `warning` itself is too light to read.
- Each tone has a soft fill, for status pills, icon tiles, notices and count pills: `primary-soft`, `info-soft`,
  `success-soft`, `warning-soft` and `destructive-soft`. Lighter tints and their borders: `primary-tint` and
  `primary-border` (the "Your next step" card), `warning-` and `destructive-tint` and `-border` (notices, danger
  zones, failing rows), `success-tint` (added rows). Use these, never a tone at an opacity such as `bg-success/10`.
- `border-strong` outlines checkboxes and switches; `disabled-foreground` is disabled text and icons.
- `kind-buyer`, `kind-supplier` and `kind-forwarder`, with their `-soft` tiles, mark a workspace's kind in the
  workspace menu, never an action.
- `scrim` is behind dialogs, sheets and the command menu. `chart-1` to `chart-3`, `chart-1-soft` and `chart-muted`
  are chart series; `handoff-pickup`, `handoff-forwarder-soft` and `on-light-info` are the lead time bars.
- Shadows are for overlays and the action bar only, each its own token: `shadow-menu` (menus, submenus, popovers,
  selects and toasts), `shadow-dialog` (dialogs and side sheets), `shadow-command`, `shadow-sheet` (a bottom sheet),
  `shadow-action-bar` and `shadow-action-bar-docked`, and `shadow-tooltip`.
- `text-meta` is the 13px small print beside a value: breadcrumbs, a record's meta row, a field's problem. It keeps its
  parent's line height. Write `text-meta`, never `text-[13px]`.

Every color in the app is one of these tokens, never a literal: no hex, `rgb()` or Tailwind palette color such as
`bg-black`. The exceptions are content, not UI: store and sign-in provider logos, product option swatches, and the
marketing site, sign-in, getting started and maintenance pages, which have their own look.

The light values are the design's own, copacker.pen's `rd-*` variables, read from the file rather than approximated.
The design has no dark values, so the dark theme mixes each tint from its tone and the background.

Controls follow the kit's sizes: buttons, icon buttons and a list's filter controls are 34px, form inputs 36px, touch
controls on phones and packing 44px, all with an 8px radius (`rounded-md`); cards take 10px (`rounded-lg`).

Dark mode is the `.dark` class on `<html>`; use Tailwind's `dark:` variant. The account menu's Theme chooses it:

- **The store:** `themeStore` in `src/lib/theme.ts`, from `@buildkitgg/shadcn-theme`. It keeps a light or dark choice
  in localStorage under `theme` (as `{"theme":"dark"}`), follows the computer without one, and sets `.dark` and
  `color-scheme` on `<html>`. Choosing System calls `reset()`, so nothing is kept.
- **Starting it:** `Providers` starts it in the browser. Starting is counted, so the store keeps running while one
  layout replaces another.
- **First paint:** `ThemeScript` in the root layout runs the store's init script before the page paints. It first
  rewrites a choice saved before the store, as the bare word `light` or `dark`, in the store's format.
- **Reading it:** components call `useTheme(themeStore)` from `@buildkitgg/react-theme`; there's no provider. On the
  server and while hydrating, it reports System.
- **Storybook:** the toolbar's theme calls `themeStore.setTheme`.

## Utilities

`globals.css` defines two utilities of the app's own. `cn()` knows them, and `text-meta`, so a class passed after one
of them doesn't replace it.

- `focus-ring`: the ring a control shows when the keyboard reaches it (`outline-none`, then `ring-3 ring-ring/50` on
  `:focus-visible`). Every interactive element that isn't a kit component takes it, with a `rounded-*` to shape it.
- `text-link`: a link inside a sentence, underlined in the text's own color, with the focus ring. A link that's
  underlined only on hover, such as a record's name in a table, takes `focus-ring rounded-sm` instead.

## The kit's variants

Reach for these before writing the classes they stand for:

| Need                                          | Use                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A card whose table or list runs edge to edge  | `<Card flush>`: no gap or padding; a direct `CardHeader` keeps the padding, with a rule under it when something follows |
| A table's edge columns in line with its card  | `<Table framed={false} inset>`: 16px, or 12px in a small card                            |
| A button that's 44px on a phone, 34px from `sm` | `size="responsive"`, or `size="icon-responsive"` for an icon button                     |
| A quiet remove or disconnect                  | `variant="ghost-destructive"`: muted until pointed at, then red                           |
| A menu, popover or dialog trigger that's a button | `render={<Button variant=… size=… />}` on the trigger, never the button's classes copied |
| A number without the browser's spin buttons   | `NumberInput`, or `InputGroupNumberInput` inside an `InputGroup`                          |
| Something loading                             | `Spinner`, which stops turning for reduced motion                                         |
| An empty list, a failed page, an empty menu   | `EmptyState` from `@/components/common`: `icon`, an optional `title` (`titleAs` for a heading) and `description`, and its actions as children. `ui/empty`'s pieces carry the same spacing and 40px icon tile |
| A popover                                     | `PopoverContent`, with its size and padding overridden, not Base UI's parts               |
| A select's options                            | `SelectItem`s inside a `SelectGroup` in `SelectContent`: the group gives the menu its 4px inset. Items straight in `SelectContent` sit flush against the menu's edge |

## Page patterns

One component per concept, from the redesign's kit ([consistency](specs/app-redesign/consistency.md)):

| Component                                        | Use                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `Alert` (`components/ui/alert.tsx`)              | A page's notice, above its content: what happened and, in its action, what deals with it     |
| `ActionBar` (`components/action-bar.tsx`)        | Unsaved changes, a task flow's summary and submit, a proposal to review, bulk actions. Floats over the column, docks on a phone |
| `LifecycleTracker` (`components/lifecycle-tracker.tsx`) | A record's stages: done, current, waiting on the viewer, not started. A compact card on a phone |
| `NextStepCard` (`components/next-step.tsx`)      | A record's one next step for the viewer, or who it waits on. On a phone its actions go in the `ActionBar` |
| `TabLinks` (`components/tab-links.tsx`)          | A list's views and a record's tabs, as links with counts                                     |

`ActionBar`, `LifecycleTracker` and `NextStepCard` are prototypes for now: only their stories use them.

## Where things live

| Module                    | Use it for                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `src/app/globals.css`     | Tailwind, shadcn's base styles, the theme mapping, `text-meta`, the base rules preflight leaves out, and the `focus-ring` and `text-link` utilities. Imported by the root layout and the marketing pages, after `theme.css`. |
| `components.json`         | The shadcn CLI's settings.                                                                   |
| `@/styles/theme.css`      | The color, radius, font and shadow tokens as CSS variables, and `vars` for TypeScript that needs a token, such as the charts. |

## Tables

Tables use the shadcn `Table`, which frames itself with a rounded border and a muted header band, like shadcn's data
table. A table that sits inside a card runs edge to edge instead: `<Table framed={false} inset>` in a `<Card flush>`,
under its `CardHeader`. Never put a framed table inside a card. Numbers are right-aligned with `tabular-nums`, and a
value that doesn't apply is `NoValue` (`components/no-value.tsx`): a muted `—` that screen readers hear as "None", or
as its `reason`. A row that opens a record is clickable as a whole through `LinkRow` (`components/link-row.tsx`), given
an `href` for a page or `onOpen` for a sheet or dialog, while its own link or button stays for keyboard and screen
readers. A product's photo is `ProductThumb` (`components/product-thumb.tsx`), 40px unless a `size-*` class says
otherwise, with an icon when there's no photo. Per-row actions live in a trailing ⋯ menu. Columns
that only matter on a wide screen hide with container queries (`hidden @4xl:table-cell` inside an `@container`), and on
a phone a table can stack each row (`@max-md:block` on the table and body, `@max-md:flex` on rows) instead of scrolling
sideways. See Restock and Orders.

## Statuses

Every status renders through `Status` (a known status string) or `StatusBadge` (a tone and a label) from
`@/components/common`: a lightly tinted pill with a dot or icon, in one of five tones. One label always takes one tone:
warning when the viewer has to act, info while someone else is working, success when it's ready or done well, neutral
when idle or filed, destructive when it failed or is lost. `Status` knows every status the app stores, a store's sales
order statuses (Shipped, Pending, Partially fulfilled) and a supplier's product and catalog statuses, so the same word
never takes two tones. Its words agree with what the status is of: `labels="sales"` reads a sales order's from
`sales.status` (French "Expédiée", for une commande) and `labels="supplier"` a product's or catalog's from
`supplier.shared.status`; anything else reads `common.status`. The full list is in
[consistency](specs/app-redesign/consistency.md#statuses). Don't style badges by hand.

`StatusBadge` is a `Badge` with `tone`: the tone's surface (`toneSurface` in `ui/badge.tsx`, its soft fill with text in
the tone's color) without an outline. The Overview's change pills and the action bar's lead tile use the same surfaces.
