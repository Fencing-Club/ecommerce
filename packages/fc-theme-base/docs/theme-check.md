# Theme Check and translations

## Theme Check

Shopify's Theme Check lints the theme's Liquid, JSON and locales:

```bash
pnpm --filter @repo/fc-theme-base lint
```

Errors fail the check, and warnings are reported only. `pnpm verify` and CI's verify job run it through
`check:lint`. `.theme-check.yml` leaves out `tests/`, `stories/` and `.storybook/`, which hold the component lab and
Storybook fixtures that Shopify never receives.

## Translations

The theme ships English only (`locales/en.default.json` and `locales/en.default.schema.json`) while it's being built.
Other languages get added once the build is done.

Every customer-facing string still goes through a translation key with the `t` filter, never text written into the
Liquid, so adding a language later only means adding its locale files. Theme Check fails on a key that's missing from
`en.default.json`.
