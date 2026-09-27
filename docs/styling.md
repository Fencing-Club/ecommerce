# Styling

Copacker uses [shadcn/ui](https://ui.shadcn.com) components styled with [Tailwind CSS](https://tailwindcss.com) v4,
next to [vanilla-extract](https://vanilla-extract.style) for page styles written before the switch.

- **Shared components** under `apps/copacker/src/components/ui` are shadcn's own source on Base UI (style
  `base-nova`), added with the shadcn CLI and styled with Tailwind classes. Add one from `apps/copacker` with
  `pnpm dlx shadcn@latest add <component>`. Edit them like any other code: the frame and header band on `Table` are
  ours.
- **New UI** uses Tailwind classes, shadcn components and their conventions: `data-slot`, `cn()` from `@/lib/utils`,
  `cva` for variants.
- **Existing page styles** in colocated `*.css.ts` files and the `sx()` helper keep working. Move a component to
  Tailwind when it's being reworked anyway; there's no need to convert the rest.

## Theme

Colors keep shadcn's names (`primary`, `muted-foreground`, `chart-1`, plus `success` and `warning`). Their light and
dark values live once, in `src/styles/theme.css.ts`, which sets the CSS variables on `:root` and `.dark`.
`src/app/globals.css` maps those variables into Tailwind's theme (`bg-primary`, `text-muted-foreground`,
`text-success`), so both systems read the same tokens. Change a color in `theme.css.ts` only.

Dark mode is the `.dark` class on `<html>`, set by the theme menu; use Tailwind's `dark:` variant.

## Precedence

vanilla-extract page styles and `sx()` are unlayered, so they win over Tailwind's layered utilities. Don't style the
same property on one element with both. Where a component is on Tailwind, keep its layout in Tailwind too.

## Where things live

| Module                    | Use it for                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `src/app/globals.css`     | Tailwind, shadcn's base styles, and the theme mapping. Imported once in the root layout.      |
| `components.json`         | The shadcn CLI's settings.                                                                   |
| `@/styles/theme.css`      | `vars`: the color, radius, font and shadow tokens, for vanilla-extract styles.               |
| `@/styles/tokens`         | Build-time helpers for vanilla-extract: `space(4)`, `alpha(color, 50)`, `fontSize.sm`.       |
| `@/styles/sprinkles.css`  | `sx()`: typed layout and text utilities with `sm`/`md`/`lg`/`xl` responsive values.          |
| `@/styles/global.css`     | The reset and base element styles. Imported before `globals.css` in the root layout.         |
| `@/styles/utilities.css`  | `srOnly` for visually hidden text in vanilla-extract code; Tailwind code uses `sr-only`.     |

## Tables

Tables use the shadcn `Table`, which frames itself with a rounded border and a muted header band, like shadcn's data
table. Statuses are outline badges with an icon (`CircleCheck` in `text-success`, `CircleAlert` in
`text-destructive`, `Clock` while open) rather than filled colors. Numbers are right-aligned with `tabular-nums`.
Columns that only matter on a wide screen hide with container queries (`hidden @4xl:table-cell` inside an
`@container`), and on a phone a table can stack each row (`@max-md:block` on the table and body, `@max-md:flex` on
rows) instead of scrolling sideways. See Restock and Orders.
