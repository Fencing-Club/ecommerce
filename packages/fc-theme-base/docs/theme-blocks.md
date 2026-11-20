# Theme blocks

The theme is moving its sections onto [Shopify theme blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks).
Shared blocks live in `blocks/`. A section lists the blocks it accepts in its schema and renders them with
`{% content_for 'blocks' %}`, so merchants can add, reorder and nest them in the theme editor.

## The shared blocks

- **Heading** (`heading.liquid`): the heading text, its level (`h1` to `h4`, `h2` by default), a size from small to
  extra large, and its alignment. Level sets the document outline and size sets the look, so pick them separately.
- **Text** (`text.liquid`): rich text in one of three styles: body, subtle (smaller, muted, for supporting detail)
  or eyebrow (the small uppercase label above a heading), and its alignment. Merchants type eyebrows in normal case;
  the style makes them uppercase.
- **Button** (`button.liquid`): a label, a link, a style (primary, secondary or outline), a size and an optional
  trailing arrow. It renders through `ui-button`. Without a link it shows disabled, so it stays visible in the editor.
- **Image** (`image.liquid`): an image, shown at its own shape or cropped to square, portrait, landscape or wide.
  Its alt text comes from the image in Shopify's files. With no image, Shopify's placeholder illustration shows.
- **Group** (`group.liquid`): a column or a row of any theme blocks, with a spacing step and alignment on both
  axes. Rows wrap when they run out of room. Groups nest, so a section header is a column group holding a text
  eyebrow, a heading and a row group of buttons.

## Rules

- Keep each block small: one element and the settings real sections need. Reach for a group before adding layout
  settings to another block.
- A block a single parent uses is private: its file name starts with `_` and only that parent lists it.
- A block renders through the shared `ui-*` snippet for its element when one exists, and styles only with the
  [design tokens](design-tokens.md). Its CSS sits in its own `{% stylesheet %}`, which Shopify bundles once.
- The root element carries `{{ block.shopify_attributes }}`, so the theme editor can select the block.
- The schema's name, labels, options and default text are `t:` keys in `locales/en.default.schema.json`, under
  `blocks`. Labels shared across blocks, like size and alignment, sit under `blocks.all`. Every block has a preset.
- Blocks add no page gutter. The section around them puts its content on the gutter, as described in
  [page layout](shopify-page-layout.md).

## Stories

Each block has stories in `stories/blocks/`, titled `Blocks/<name>`. `block(type, { blocks })` from
`stories/liquid.js` is the story's `render`: its args become the block's settings, and `blocks` are the blocks nested
inside it. See [Storybook](storybook.md).
