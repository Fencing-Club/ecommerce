# Design tokens

The theme's design tokens are CSS variables defined once at the top of `assets/base.css`, which every layout loads.
Colors and radii use [shadcn/ui's theme names](https://ui.shadcn.com/docs/theming) with Fencing Club's values.
Spacing, type, shadows and motion use [Tailwind's theme variables](https://tailwindcss.com/docs/theme), which shadcn is
built on, with Tailwind's values. Storybook's Foundations stories show each scale.

## Rules

- Prefer alignment with shadcn over custom values. A custom value or a token shadcn doesn't have needs a before and
  after, shown with the real components in Storybook side by side with the shadcn value, before it's added.
- Use the role, not the look: `--primary` for the main action, `--muted-foreground` for secondary text, `--border`
  for dividers and card edges, `--input` for field borders, `--ring` for the focus ring, `--destructive` for errors.
- Use the radius scale: `--radius-sm` for small marks, `--radius-md` for controls, `--radius-lg` for notices and
  fields, `--radius-xl` for cards and media. Pills and swatches stay fully rounded.
- Space with the step tokens, `--spacing-0-5` to `--spacing-24`, named after Tailwind's steps (its `p-4` is
  `--spacing-4`, 16px). Half steps use a hyphen: `--spacing-1-5`.
- Size text with `--text-xs` to `--text-5xl` and their `--text-*--line-height` pairs, and weight it with
  `--font-weight-*`. One family, `--font-sans`, the device's own font: SF Pro on Apple devices, Segoe UI Variable on Windows 11,
  Roboto on Android. Nothing downloads. `--font-body-family` and `--font-heading-family` point at it.
- Printables use Inter Regular and SemiBold, embedded in the PDF, because a PDF can't use the device's font. Their
  colors are the same tokens, copied into the generator ([printables](../printables/README.md)).
- Raise with the shadow scale: `--shadow-lg` for menus and popovers, `--shadow-xl` for panels and banners,
  `--shadow-2xl` for dialogs.
- Animate with `--default-transition-duration` (150ms) or `--duration-enter` (200ms) and `--ease-out`.
- Lay pages out on the gutter tokens (`--gutter`, `--content-max`, `--page-gutter`), described in
  [page layout](shopify-page-layout.md).
- Colors shadcn has no role for come from the Tailwind palette, written as the hex value with the palette name in a
  comment.
- `FencingClubWebsite.pen` uses the same names on its Tokens board, so a token reads the same in the design and in
  code.

## Not tokens yet

The `ui-*` components in `assets/component-ui.css` use only the color, spacing and type tokens, never Dawn's
`--color-foreground` channels or raw colors. A scope that changes color, such as the hero's light text, sets the
shadcn tokens (`--foreground`, `--muted-foreground`) and the components follow. A custom property reads the values
set on its own element, so a scope that swaps roles, such as the newsletter band making `--primary` light, sets them
on nested elements, each reading only roles set further out. Where the Pen uses a size off the scale, such as 13px or
11px text, the component takes the nearest token. Section CSS, the inverted header and a few one-off colors still use
raw values; they move to tokens as their components are restyled.
