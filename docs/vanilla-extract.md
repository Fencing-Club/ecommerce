# Styling with vanilla-extract

Copacker styles components with [vanilla-extract](https://vanilla-extract.style): typed, zero-runtime CSS written in
`*.css.ts` files. The shadcn/ui components under `apps/copacker/src/components/ui` keep their shadcn structure and
props, and each one's styles live in a colocated `*.css.ts` file instead of Tailwind classes.

## Where things live

| Module                  | Use it for                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `@/styles/theme.css`    | `vars`: design tokens. Colors keep shadcn's names (`vars.color.primary`, `mutedForeground`). |
| `@/styles/tokens`       | Build-time helpers: `space(4)`, `alpha(color, 50)`, `fontSize.sm`, `focusRing`, `media.md`.  |
| `@/styles/sprinkles.css` | `sx()`: typed layout and text utilities with `sm`/`md`/`lg`/`xl` responsive values.        |
| `@/styles/animations.css` | `fade` and `pop` for Base UI `data-open`/`data-closed`; `spin` and `pulse` keyframes. |
| `@/styles/global.css` | Reset, base element styles, and the cascade layer order. Imported once in the root layout. |
| `@/styles/layers` | Layered `style`, `globalStyle`, and `recipe` for shared UI components (see below). |
| `@/styles/utilities.css` | `srOnly` for visually hidden text. |

Helpers such as `space()` live in `tokens.ts`, not a `.css.ts` file, because `.css.ts` exports must be serializable.

## Cascade layers

Styles sit in three tiers: `reset`, then `components`, then everything unlayered. Shared components in
`components/ui` import `style`, `globalStyle`, and `recipe` from `@/styles/layers`, which places their rules in the
`components` layer. Page and feature styles and `sx()` use vanilla-extract directly and stay unlayered, so a
`className` passed to a shared component always overrides its defaults, as Tailwind utilities did. Use the layered
helpers only inside `components/ui`.

## Conventions

- **Colocate styles.** `button.tsx` imports from `button.css.ts`. Page and feature components with bespoke layout get a
  colocated `.css.ts` too. Use `sx()` for simple layout (`sx({ display: "flex", flexDirection: "column", gap: 6 })`).
- **Variants use `recipe()`** from `@vanilla-extract/recipes` (the equivalent of `cva`). Export the variants type with
  `RecipeVariants`.
- **`selectors` may only target the element itself (`&`).** Style children with
  ``globalStyle(`${parent} svg`, {...})``, and style an element based on its parent with
  ``selectors: { [`${parent}[data-size='sm'] &`]: {...} }`` or an attribute selector such as
  `"[data-slot='sidebar'] &"`. This replaces Tailwind's `group-*`, `peer-*`, `has-*`, and `[&_svg]` modifiers.
- **States come from attributes.** Base UI sets `data-open`, `data-closed`, `data-checked`, `data-disabled`,
  `data-side`, and `aria-*`; target them in `selectors`.
- **Dark mode** is `".dark &"`. Responsive styles use `"@media": { [media.md]: {...} }` or `sx` conditions.
- **Icons** size themselves with `sx({ size: 4 })`. Inside buttons, icons default to 1rem unless they carry
  `data-size`.
- **Join classes with `cn()`** from `@/lib/utils` so callers can still pass `className`.
- **Keep component APIs stable.** Props, `data-slot` attributes, and markup stay the same; only styling changes.
