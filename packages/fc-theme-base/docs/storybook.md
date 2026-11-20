# Storybook

The theme's component library lives in Storybook 10 (`@storybook/html-vite`). Each story renders a real theme snippet
through liquidjs in the browser, with the theme's CSS, scripts and settings, so a change to a snippet shows up in its
story. Storybook is where components get built and reviewed before they go into sections, and its stories are the
stable entries for visual regression testing.

```bash
pnpm --filter @repo/fc-theme-base storybook
```

It runs at `http://localhost:6107`.

## How a story renders Liquid

- `stories/liquid.js` builds a liquidjs engine over every file in `snippets/` and `sections/`, and exports
  `renderLiquid(name, variables)`, `snippet(name)`, `block(type)` and `section(name)`. `snippet(name)` makes a story's
  args the snippet's variables, as `{% render name, ... %}` would. `block(type, { blocks })` makes them a theme block's
  settings and renders it as a section's `{% content_for 'blocks' %}` would, with `blocks` nested inside it.
  `section(name, { blocks, staticBlocks, variables })` makes them a section's settings, with its theme blocks, the
  static blocks its `{% content_for 'block' %}` tags render, and extra globals such as `blogs`.
- `tests/helpers/shopify-liquid.mjs` holds the stand-ins for Shopify's own tags and filters (`t`, `money`,
  `image_url`, `asset_url`, `form` and the rest). The unit tests and the component lab register the same ones.
- `.storybook/preview.js` writes the CSS variables `layout/theme.liquid` writes: the color schemes from
  `config/settings_data.json` and `snippets/theme-tokens.liquid`. `.storybook/preview-head.html` loads the CSS and
  scripts the layout loads on every page. A story passes `stylesheets` to `snippet()` for the CSS its section adds.
- Theme assets are served at `/theme-assets/`, and `asset_url` points there. They can't use `/assets/`, because Vite
  serves the SVGs that stories inline from that path.

- `{% content_for 'blocks' %}` renders the theme blocks of the section or block it sits in, each from
  `blocks/<type>.liquid` with `block` set and its settings filled from the block's schema defaults, inside the
  `shopify-block` wrapper Shopify adds. `{% content_for 'block', type: 'x', id: 'y' %}` renders one static block from
  the section's `static_blocks`. As on a store, `section.blocks` leaves the static blocks out.

The stand-ins only approximate Shopify. `{% form %}` renders nothing, images ignore their sizes, and there are no
section rendering or store requests. Check sections on the contosocamp store before release.

## Writing stories

- Stories live in `stories/`, grouped as `foundations/` (the design tokens and the
  [page gutter](shopify-page-layout.md#the-checks)), `elements/`, `inputs/`, `components/`, `blocks/` (the
  [theme blocks](theme-blocks.md)) and `sections/`, which has a folder per page (`sections/home/`). They can't sit beside
  the Liquid, because Shopify only accepts Liquid and JSON in the theme's folders.
- Name the story file after the component (`button.stories.js` for `ui-button.liquid`) and title it by group
  (`Elements/Button`). Give each state its own story.
- Every story has a `play` function that checks behavior, text, roles and attributes, never colors. Each story's
  accessibility check runs too, and a violation fails the test.
- Shared fixtures (products, articles) live in `stories/fixtures.js` and use the theme's own sample images.
- A snippet that needs its section's script gets it from a `loaders: [loadScript('file.js')]` entry, because markup
  a story renders can't run its own `<script>` tags.
- Foundations stories paint with the live CSS variables, so a token change shows there too.

## Tests

Vitest runs every story's play function and accessibility check in Chromium:

```bash
pnpm --filter @repo/fc-theme-base exec vitest run --project storybook
```

`pnpm test` and `pnpm verify` run only the unit tests. CI's `theme-stories` job runs the stories whenever the theme
changes.
