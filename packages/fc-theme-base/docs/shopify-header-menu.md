# Shopify Header Menu

The header renders the main menu twice: the mega menu (`snippets/header-mega-menu.liquid`) for wide screens and the
drawer (`snippets/header-drawer.liquid`) for phones and tablets. CSS shows one or the other.

The mega menu is always on the page, so its links are the ones search engines follow. The drawer keeps its copy of
the menu, with its language and country pickers, inside a `<template>` until a shopper first opens it. `HeaderDrawer`
in `assets/global.js` then builds the menu and wires its submenus. This keeps several hundred elements off every page.

Anything that reads the drawer's menu has to wait for it to open, or call `renderContent()` on the `header-drawer`
first.

## Search and localization

The header renders one search panel, beside the account and cart icons. A second copy beside the menu button only
renders without a menu or customer accounts, the layouts where the header CSS shows it.

The country picker lists every market, so `country-localization` keeps the list in a `<template>` until the picker
first opens, when `assets/localization-form.js` puts it in. The flags only show in that list, so
`country-flags.css` loads without holding up the page.
