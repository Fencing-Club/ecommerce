# Product card

`snippets/ui-product-card.liquid` is the one product card. The homepage, collection grid, search results and the
product page's recommendations all render it, and its stories render the same snippet.

## What it shows

- **Photo.** Square, on the muted tile, with photos multiplied onto it so white backdrops blend in. Up to four of the
  product's images. On pointer screens hovering shows arrows and a progress bar; touch screens swipe and the bar
  follows. `assets/product-card-gallery.js` runs the arrows and the bar.
- **Protection level**, top left, from `custom.protection_rating` and `custom.fie_status` through
  `snippets/ui-protection-badge.liquid`. Non-FIE adds nothing to the rating.
- **Sale or Sold out**, top right. A sale shows the percentage off the compare price. A sold-out card fades its photo
  and drops the sale.
- **Brand logo**, bottom left, for other brands only. It comes from the Brand metaobject whose handle matches the
  vendor's handle, so our own brand, with no entry, shows none.
- **Name**, up to two lines.
- **Price row**: the price, the struck compare price, then up to three color swatches and how many more there are.
  Card prices drop trailing zeros. A color with its own photo is a button: it shows that photo, rings the swatch and
  points the card's links at that color. Colors without one are plain swatches.

## Photo loading

Photos load when they near the screen. The collection grid and search results load the first row of their first
page right away, and the first card's photo at high priority (`image_fetchpriority: 'high'`), since it is the
largest image on screen when the page opens.

## Quick add and quick view

With `show_add`, touch screens get a round add button over the photo. A product with one variant goes straight into
the cart; anything with options links to the product page. Pointer screens hide it.

With `quick_view`, pointer screens get an eye button there on hover, and touch screens' add button opens
[quick view](shopify-quick-view.md) for products with options instead of the product page. The photo arrows and the
eye button darken on hover.

The card has no category line, wishlist, rating or SKU.
