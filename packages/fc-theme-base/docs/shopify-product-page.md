# Product page

The product page's top is `sections/main-product.liquid`: the photos beside the buy box on desktop, stacked with a
photo carousel on phones. `templates/product.json` puts **Page breadcrumbs** above it and the disclosures and related
products below, with **Product details** between them. [Product specs](shopify-product-specs.md) lists where each
part's data lives.

## Parts

- `snippets/product-gallery.liquid`: the first photo large over a grid of two on desktop, showing five, with
  View all photos when there are more. Phones get a carousel that peeks at the next photo, with dots. The protection
  badge sits over the gallery and the zoom icon on whichever photo is first. Videos show a play icon.
- `snippets/product-photo-viewer.liquid`: every photo and video full size on a dark dialog, with the count, arrows and
  thumbnails. Arrow keys, swipes, arrows and thumbnails move between photos. Close or Escape returns focus to the
  photo that opened it.
- `snippets/product-option-pickers.liquid`: the same pickers quick view uses. Size starts unpicked
  (`snippets/product-size-unpicked.liquid`), so Add to cart asks for a size first. Size guide opens the size chart
  drawer (`snippets/size-chart-flyout.liquid`) and is a link to the chart page without JavaScript.
- `snippets/product-stock-line.liquid`, detailed: a dot and the stock, with how many are left at five or fewer, above
  Add to cart.
- `snippets/product-ships-line.liquid`: the ships row, first among the trust notes under the buttons. Woodinville stock
  counts down to the day's cutoff and ships that business day. Partner warehouse stock ships a set number of business
  days later. US shoppers see the arrival range first, then the countdown or the day Woodinville stock ships; partner
  stock's arrival range stands alone. The section's Shipping settings hold the cutoff hour and the day ranges.
- `snippets/product-sticky-bar.liquid`: the buy bar, shown once the page's Add to cart scrolls away. Desktop has it
  across the top with the photo, name, choice, price and Add to cart. Phones have it along the bottom with the
  price, choice and Add to cart. Before a size is picked its button reads Choose a size and goes back to the sizes.
  Sections further down join its links by carrying `data-product-section` with their name and an `id`.
- The buy row: quantity, Add to cart and, once a size is picked and in stock, Shopify's express checkout button.
  Shopify draws Buy with Shop Pay. Where Shop Pay is off, its plain Buy it now takes the primary button's look
  (UI/Express checkout in `assets/component-ui.css`). App blocks, such as a back-in-stock form, sit under it, then
  the trust notes, one line each: the ships row, then the section's **Trust note** blocks (Free returns by default).

## Product details

`sections/product-details.liquid` holds the parts under the buy box, each a private block that renders only when the
product has its data: Overview (the description, the second photo and feature cards), Specs, Care, Reviews (the
reviews app's block, which goes inside it) and Questions. With none of them, the section renders nothing.

- On phones each part is a row that opens in place, with Overview open. From 990px they all show open, each with its
  label as the eyebrow over its heading, under a row of links to each part. `snippets/product-details-part.liquid`
  draws each one.
- A part carries its label and anchor in `data-product-section` and `id`, so the section's links and the buy bar's
  find it.
- Questions shows the first five, with the first open, and Show more questions reveals the rest. The rest are on the
  page from the start, hidden until found, so search engines and find in page reach them.
- Care symbols are `snippets/ui-care-symbol.liquid`, matching the Pen's Icon/Care set.

## Scripts

- `assets/product-options.js` loads the section again for each variant through the section rendering API, so price,
  stock and buttons come from Liquid. On the product page it also puts `?variant=` in the address.
- `assets/product-page.js` defines `<product-page>`. It opens the viewer and Size guide's drawer, brings a picked
  variant's photo to the front, shows the buy bar and works out the ships line. Shopify's express checkout button is
  drawn again after each variant loads.
- `assets/product-details.js` defines `<product-details>`. From 990px it keeps every part open and takes the parts'
  headings out of the tab order. It runs Show more questions.
- `assets/photo-gallery.js` scrolls the gallery and the viewer.

## Stories

`stories/sections/product/main-product.stories.js` covers picking a size, low stock, partner stock, sold out, the
photo viewer, Size guide and the buy bar. `product-details.stories.js` covers every part, a product with only a
description, one with nothing to show and Show more questions.
