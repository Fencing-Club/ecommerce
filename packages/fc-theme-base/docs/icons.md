# Icons

The theme's icons are [Lucide](https://lucide.dev), the same set Copacker uses. `snippets/ui-icon.liquid` holds them,
and every icon goes through it:

```liquid
{% render 'ui-icon', icon: 'truck', size: 20 %}
```

`size` is the width and height in pixels and defaults to 16. Buttons and links size their own icons. Icons are
decorative (`aria-hidden`), so the control around one carries its accessible name.

## Adding an icon

`ui-icon.liquid` is generated, so don't edit it by hand. A theme has no build step, so the icons have to live in a
theme file. `scripts/build-icons.mjs` copies them from the `lucide-static` package.

1. Find the icon's name on [lucide.dev](https://lucide.dev).
2. Add it to `scripts/icons.json`.
3. Run `pnpm --filter @repo/fc-theme-base icons:build`.

Updating Lucide means bumping `lucide-static` and running `icons:build` again.

## Checks

- `tests/icons.test.js` fails when `ui-icon.liquid` doesn't match what `icons:build` generates, or when the theme
  names an icon that isn't in `scripts/icons.json`. An unknown name would otherwise render an empty icon.
- The `Elements/Icon` story shows every icon with its name.
