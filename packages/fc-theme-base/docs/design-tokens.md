# Design tokens

The theme's colors and corner radii are CSS variables named after
[shadcn/ui's theme tokens](https://ui.shadcn.com/docs/theming), with Fencing Club's values. They're defined once at the
top of `assets/base.css`, which every layout loads, and components use them instead of raw colors.

## Rules

- Prefer alignment with shadcn over custom values. A custom value or a token shadcn doesn't have needs a before and
  after, shown with the real components in Storybook side by side with the shadcn value, before it's added.
- Use the role, not the look: `--primary` for the main action, `--muted-foreground` for secondary text, `--border`
  for dividers and card edges, `--input` for field borders, `--ring` for the focus ring, `--destructive` for errors.
- Use the radius scale: `--radius-sm` for small marks, `--radius-md` for controls, `--radius-lg` for notices and
  fields, `--radius-xl` for cards and media. Pills and swatches stay fully rounded.
- Colors shadcn has no role for come from the Tailwind palette, written as the hex value with the palette name in a
  comment.
- `FencingClubWebsite.pen` uses the same names on its Tokens board, so a token reads the same in the design and in
  code.

## Not tokens yet

The dark bands (newsletter, support band, inverted header) and a few one-off colors still use raw values. They move
to tokens as the components that use them are restyled.
