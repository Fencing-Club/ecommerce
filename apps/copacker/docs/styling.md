# Styling

Copacker uses [shadcn/ui](https://ui.shadcn.com) components styled with [Tailwind CSS](https://tailwindcss.com) v4.
[vanilla-extract](https://vanilla-extract.style) holds the theme tokens, and nothing else.

- **Shared components** come from `@buildkitgg/shadcn`, which
  [shadcn-sync](https://github.com/betterapps-hq/buildkit/tree/main/packages/shadcn/shadcn-sync) builds into
  `node_modules/.buildkit/shadcn` on every install: stock shadcn in the `base-vega` style on Base UI, with lucide
  icons, the neutral theme, and logical classes (`ms-`, `ps-`, `start-`) for right-to-left pages. The `postinstall`
  in `package.json` holds those settings. `shadcn-registry.json` is the registry snapshot the build reads, so every
  install gets the same components until someone runs `pnpm exec shadcn-sync update` and commits the new snapshot.
  Import the components from the package. The app keeps no copy of shadcn's source, no `components.json` and no
  shadcn CLI.
- **Take the components as they are.** When one needs something it doesn't do, wrap it in `src/components` (as
  `FlushCard` and `NumberInput` do) or pass a class from `@/lib/controls`. Never copy or patch a component's source,
  generated or not; a bug in one goes to shadcn-sync in buildkit, or to shadcn.
- **Direction and words.** `ShadcnProvider` (`components/shadcn-provider.tsx`) gives the components the page's
  direction, through Base UI's `DirectionProvider`, and the app's `cn()`. shadcn's built-in labels are English, so
  the app passes translated ones from `common.ui`: `DialogContent` and `SheetContent` come from
  `components/overlay-content.tsx`, whose close button reads in the locale's language; the sidebar's rail and toggle
  take an `aria-label`; and every `Spinner` sits beside text and is `aria-hidden`. The mobile sidebar's hidden title
  and a combobox chip's remove button have no prop for a label, so they stay English or unnamed.
- **New UI** uses Tailwind classes, shadcn components and shadcn's conventions: `data-slot`, and `cn()` from
  `@/lib/utils`.
- **Reset:** Tailwind's preflight. `globals.css` adds the few base rules it leaves out: the body's full height and font
  smoothing, and the pointer on buttons.

## Theme

The colors are shadcn's tokens and nothing else: `background`, `primary`, `muted-foreground`, `destructive`, `border`,
`ring`, `chart-1` to `chart-5`, the `sidebar-*` family and the rest. Their light and dark values live once, in
`src/styles/theme.css.ts`, which sets the CSS variables on `:root` and `.dark`. It loads after `globals.css`, so its
values replace the generated defaults. `@buildkitgg/shadcn/tailwind.css`, which `globals.css` imports, maps those variables into
Tailwind's theme (`bg-primary`, `text-muted-foreground`), so both systems read the same tokens. The
values are shadcn's orange theme on neutral, in Tailwind v4's colors, as in `designs/CopackerShadcn.lib.pen`. Two
differ from shadcn's on purpose, for contrast: `sidebar-primary` is orange-700, where shadcn's is lighter, and
`muted-foreground` is `#6b6b6b`. Don't change them back, and don't add other differences: every other value, `ring`
included, is shadcn's.

Never add a token of our own. A color shadcn has no token for comes from Tailwind v4's palette, the way shadcn's own
examples color a status, with a `dark:` pair:

| Role                                                     | Classes                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| Success: done, ready, a rise                             | `text-green-800 dark:text-green-400`, soft fill `bg-green-50 dark:bg-green-950` |
| Warning: the viewer has to act                           | `bg-amber-400` for marks; text `text-amber-800 dark:text-amber-300`; soft fill `bg-amber-50 dark:bg-amber-950`; border `border-amber-200 dark:border-amber-900` |
| Info: someone else is working on it                      | `text-sky-700 dark:text-sky-400`, soft fill `bg-sky-50 dark:bg-sky-950` |
| Primary's soft fill: the next step card, count pills     | `bg-orange-50 dark:bg-orange-950`, border `border-orange-200 dark:border-orange-900` |
| Destructive's soft fill: failing rows, danger zones      | shadcn's pattern, the token at an opacity: `bg-destructive/10 dark:bg-destructive/20`, lighter `bg-destructive/5`, border `border-destructive/30` |
| Checkbox and switch outlines; disabled text and icons    | `border-neutral-300 dark:border-neutral-600`; `text-neutral-400 dark:text-neutral-600` |
| A workspace's kind, in the workspace menu only           | buyer `text-orange-700 bg-orange-50`, supplier `text-teal-700 bg-teal-50`, forwarder `text-indigo-700 bg-indigo-50`, each with its `dark:` pair (`-500` or `-400` text on `-950`) |
| Behind dialogs, sheets and the command menu              | base-vega's overlay: `bg-black/10 supports-backdrop-filter:backdrop-blur-xs` |

`chart-1` to `chart-5` are chart series only, light to dark. As in the designs, a series that has to stand out against
the card is `chart-4`, and `chart-1` is the soft one: Amazon, Shopify and eBay are `chart-4`, `chart-2` and `chart-3`,
and a single series is `chart-4`.

- Shadows are for overlays and the action bar only, each its own token: `shadow-menu` (menus, submenus, popovers,
  selects and toasts), `shadow-dialog` (dialogs and side sheets), `shadow-command`, `shadow-sheet` (a bottom sheet),
  `shadow-action-bar` and `shadow-action-bar-docked`, and `shadow-tooltip`.
- `text-meta` is the 13px small print beside a value: breadcrumbs, a record's meta row, a field's problem. It keeps its
  parent's line height. Write `text-meta`, never `text-[13px]`.

Every color in the app is a shadcn token or a Tailwind palette color from the table above, never a literal: no hex or
`rgb()`. The exceptions are content, not UI: store and sign-in provider logos, product option swatches, and the
marketing site, sign-in, getting started and maintenance pages, which have their own look.

Controls and cards take shadcn's sizes and radii. Don't resize them, except for touch: a control a finger has to hit
on a phone, or while packing, is 44px.

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
  `:focus-visible`). Every interactive element that isn't a shadcn component takes it, with a `rounded-*` to shape it.
- `text-link`: a link inside a sentence, underlined in the text's own color, with the focus ring. A link that's
  underlined only on hover, such as a record's name in a table, takes `focus-ring rounded-sm` instead.

## The app's additions

Reach for these before writing the classes they stand for:

| Need                                          | Use                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A card whose table or list runs edge to edge  | `FlushCard` (`components/flush-card.tsx`): no gap or padding; a direct `CardHeader` keeps the padding, with a rule under it when something follows |
| A table's edge columns in line with its card  | `insetTable` from `@/lib/controls`, on the `Table`                                        |
| A table on its own, outside a card            | `FramedTable` (`components/framed-table.tsx`): shadcn's `Table` in a rounded border      |
| A button that's 44px on a phone               | `touchButton` from `@/lib/controls`                                                       |
| A quiet remove or disconnect                  | `variant="ghost"` with `ghostDestructive` from `@/lib/controls`: muted until pointed at, then red |
| A menu, popover or dialog trigger that's a button | `render={<Button variant=… size=… />}` on the trigger, never the button's classes copied |
| A number without the browser's spin buttons   | `NumberInput`, or `InputGroupNumberInput` inside an `InputGroup` (`components/number-input.tsx`) |
| A field's problem                             | `FieldError` from `@/components/field-error`, which shows a message key in the locale's language |
| An empty list, a failed page, an empty menu   | `EmptyState` from `@/components/common`: `icon`, an optional `title` (`titleAs` for a heading) and `description`, and its actions as children |
| A popover                                     | `PopoverContent`, with its size and padding overridden, not Base UI's parts               |
| A select's options                            | `SelectItem`s inside a `SelectGroup` in `SelectContent`: the group gives the menu its 4px inset. Items straight in `SelectContent` sit flush against the menu's edge |

## Page patterns

One component per concept, from the redesign's kit ([consistency](specs/app-redesign/consistency.md)):

| Component                                        | Use                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `Alert` (shadcn's)                              | A page's notice, above its content: what happened and, in its action, what deals with it     |
| `ActionBar` (`components/action-bar.tsx`)        | Unsaved changes, a task flow's summary and submit, a proposal to review, bulk actions. Floats over the column, docks on a phone |
| `LifecycleTracker` (`components/lifecycle-tracker.tsx`) | A record's stages: done, current, waiting on the viewer, not started. A compact card on a phone |
| `NextStepCard` (`components/next-step.tsx`)      | A record's one next step for the viewer, or who it waits on. On a phone its actions go in the `ActionBar` |
| `TabLinks` (`components/tab-links.tsx`)          | A list's views and a record's tabs, as links with counts                                     |

`ActionBar`, `LifecycleTracker` and `NextStepCard` are prototypes for now: only their stories use them.

A section that's mostly sentences and addresses, such as a shipment's Route, caps its own width at `max-w-prose`, so its
lines stay readable on a wide page. The components inside it fill what the section gives them and set no width of their
own: `AddressText` (`components/address-text.tsx`) lays an address out a line each, as a label prints it, wherever it
goes. Tables, card lists and forms keep the page's full width.

## Where things live

| Module                    | Use it for                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `src/app/globals.css`     | Tailwind, `@buildkitgg/shadcn/tailwind.css`, the shadow and font mapping, `text-meta`, the base rules preflight leaves out, and the `focus-ring` and `text-link` utilities. Imported by the root layout and the marketing pages, before `theme.css`. |
| `@/styles/theme.css`      | The color, radius, font and shadow tokens as CSS variables, and `vars` for TypeScript that needs a token, such as the charts. |
| `@/lib/controls`          | Classes the app adds to shadcn's controls: touch sizes, the quiet destructive button, a table inset in its card. |
| `@/lib/tone`              | The five status tones' surfaces, and `toneBadge` for a `Badge` in one.                       |

## Tables

A table on its own is a `FramedTable`: shadcn's `Table` in a rounded border, like shadcn's data table. A table that
sits inside a card runs edge to edge instead: shadcn's `Table` with `insetTable` in a `FlushCard`, under its
`CardHeader`. Never put a framed table inside a card. Numbers are right-aligned with `tabular-nums`, and a
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

`StatusBadge` is shadcn's secondary `Badge` with `toneBadge(tone)` from `@/lib/tone`: the tone's surface, its soft
fill with text in the tone's color, without an outline. The Overview's change pills and the action bar's lead tile use the same surfaces.
