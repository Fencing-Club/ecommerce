# Styling

Copacker uses [shadcn/ui](https://ui.shadcn.com) components styled with [Tailwind CSS](https://tailwindcss.com) v4.
[vanilla-extract](https://vanilla-extract.style) holds the theme tokens, the reset and a few remaining page styles.

- **Shared components** under `apps/copacker/src/components/ui` are shadcn's own source on Base UI (style
  `base-nova`), added with the shadcn CLI and styled with Tailwind classes. Add one from `apps/copacker` with
  `pnpm dlx shadcn@latest add <component>`. Edit them like any other code: the frame and header band on `Table` are
  ours.
- **New UI** uses Tailwind classes, shadcn components and their conventions: `data-slot`, `cn()` from `@/lib/utils`,
  `cva` for variants.
- **Remaining page styles** are two colocated `*.css.ts` files (`app/layout.css.ts` and
  `components/shipment-actions.css.ts`) and the `sx()` helper, used by a few components. Move one to Tailwind when
  it's being reworked anyway.

## Theme

Colors keep shadcn's names (`primary`, `muted-foreground`, `chart-1`, plus `success`, `warning` and `info`). Their light
and dark values live once, in `src/styles/theme.css.ts`, which sets the CSS variables on `:root` and `.dark`.
`src/app/globals.css` maps those variables into Tailwind's theme (`bg-primary`, `text-muted-foreground`,
`text-success`), so both systems read the same tokens. Change a color in `theme.css.ts` only.

- `info` is in-progress blue, for statuses and current stages; `chart-*` are chart series only.
- `warning-foreground` is text and icons on a warning surface, where `warning` itself is too light to read.
- Each tone has a soft fill, for status pills, icon tiles, banners and count pills: `primary-soft`, `info-soft`,
  `success-soft`, `warning-soft` and `destructive-soft`. Lighter tints and their borders: `primary-tint` and
  `primary-border` (the "Your next step" card), `warning-` and `destructive-tint` and `-border` (banners, danger
  zones, failing rows), `success-tint` (added rows).
- `border-strong` outlines checkboxes and switches; `disabled-foreground` is disabled text and icons.
- `kind-buyer`, `kind-supplier` and `kind-forwarder`, with their `-soft` tiles, mark a workspace's kind in the
  workspace menu, never an action.
- `scrim` is behind dialogs, sheets and the command menu. `chart-1` to `chart-3`, `chart-1-soft` and `chart-muted`
  are chart series; `handoff-pickup`, `handoff-forwarder-soft` and `on-light-info` are the lead time bars.
- Shadows are for overlays and the action bar only, each its own token: `shadow-menu` (menus, popovers, selects),
  `shadow-dialog`, `shadow-command`, `shadow-sheet`, `shadow-action-bar` and `shadow-action-bar-docked`, and
  `shadow-tooltip`.

Every color in the app is one of these tokens, never a literal: no hex, `rgb()` or Tailwind palette color such as
`bg-black`. The exceptions are content, not UI: store and sign-in provider logos, product option swatches, and the
marketing site, sign-in, getting started and maintenance pages, which have their own look.

The light values are the design's own, copacker.pen's `rd-*` variables, read from the file rather than approximated.
The design has no dark values, so the dark theme mixes each tint from its tone and the background.

Controls follow the kit's sizes: buttons, icon buttons and a list's filter controls are 34px, form inputs 36px, touch
controls on phones and packing 44px, all with an 8px radius (`rounded-md`); cards take 10px (`rounded-lg`).

Dark mode is the `.dark` class on `<html>`, set by the theme menu; use Tailwind's `dark:` variant.

## Page patterns

One component per concept, from the redesign's kit ([consistency](specs/app-redesign/consistency.md)):

| Component                                        | Use                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `Banner` (`components/banner.tsx`)               | The page's one notice, dismissible until its state changes; blocking errors can't be dismissed |
| `ActionBar` (`components/action-bar.tsx`)        | Unsaved changes, a task flow's summary and submit, a proposal to review, bulk actions. Floats over the column, docks on a phone |
| `LifecycleTracker` (`components/lifecycle-tracker.tsx`) | A record's stages: done, current, waiting on the viewer, not started. A compact card on a phone |
| `NextStepCard` (`components/next-step.tsx`)      | A record's one next step for the viewer, or who it waits on. On a phone its actions go in the `ActionBar` |
| `TabLinks` (`components/tab-links.tsx`)          | A list's views and a record's tabs, as links with counts                                     |

## Precedence

vanilla-extract page styles and `sx()` are unlayered, so they win over Tailwind's layered utilities. Don't style the
same property on one element with both. Where a component is on Tailwind, keep its layout in Tailwind too.

## Where things live

| Module                    | Use it for                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `src/app/globals.css`     | Tailwind, shadcn's base styles, and the theme mapping. Imported by `AppProviders` and the marketing pages. |
| `components.json`         | The shadcn CLI's settings.                                                                   |
| `@/styles/theme.css`      | `vars`: the color, radius, font and shadow tokens, for vanilla-extract styles.               |
| `@/styles/tokens`         | Build-time helpers for vanilla-extract: `space(4)`, `alpha(color, 50)`, `fontSize.sm`.       |
| `@/styles/sprinkles.css`  | `sx()`: typed layout and text utilities with `sm`/`md`/`lg`/`xl` responsive values.          |
| `@/styles/global.css`     | The reset and base element styles. Imported before `globals.css`, wherever that is.          |

## Tables

Tables use the shadcn `Table`, which frames itself with a rounded border and a muted header band, like shadcn's data
table. A table that sits inside a card runs edge to edge instead: `<Table framed={false}>` in a card with
`gap-0 overflow-hidden py-0`, under a header with `border-b`. Never put a framed table inside a card. Numbers are
right-aligned with `tabular-nums`, and a value that doesn't apply is `—`. A row that opens a record is clickable as a
whole (`LinkRow`, or a link stretched over the row) while its own link stays for keyboard and screen readers.
Per-row actions live in a trailing ⋯ menu. Columns that only matter on a wide screen hide with container queries
(`hidden @4xl:table-cell` inside an `@container`), and on a phone a table can stack each row (`@max-md:block` on the
table and body, `@max-md:flex` on rows) instead of scrolling sideways. See Restock and Orders.

## Statuses

Every status renders through `Status` (a known status string) or `StatusBadge` (a tone and a label) from
`@/components/common`: a lightly tinted pill with a dot or icon, in one of five tones. One label always takes one tone:
warning when the viewer has to act, info while someone else is working, success when it's ready or done well, neutral
when idle or filed, destructive when it failed or is lost. The full list is in
[consistency](specs/app-redesign/consistency.md#statuses). Don't style badges by hand.
