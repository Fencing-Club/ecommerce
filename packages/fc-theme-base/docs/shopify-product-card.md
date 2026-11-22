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
  Card prices drop trailing zeros.

## Quick add

With `show_add`, touch screens get a round add button over the photo. A product with one variant goes straight into
the cart; anything with options links to the product page. Pointer screens hide it.

The card has no category line, wishlist, rating or SKU.
