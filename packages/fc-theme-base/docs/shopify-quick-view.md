# Quick view

Quick view opens a product in a dialog over the collection page, so shoppers can pick a size and add to cart without
leaving the grid. On pointer screens a card's eye button, shown on hover, opens it. On touch screens the card's add
button opens it for products with options.

## Parts

- `snippets/quick-view-dialog.liquid` is the dialog the collection grid renders once. It holds the close button, the
  loading skeleton and the error message.
- `sections/product-quick-view.liquid` is the product inside it. `assets/quick-view.js` fetches it through the section
  rendering API (`?section_id=product-quick-view`) when a card's button is pressed.
- The options are `snippets/product-option-pickers.liquid` on `ui-variant-picker`, and `assets/product-options.js`
  loads the chosen variant. The product page uses the same pickers and script.

## What it shows

- Photos with thumbnails and arrows on desktop; phones get a sheet from the bottom with one swipeable photo.
- Brand, name, rating (when the product has `reviews.rating`), price and a short summary.
- Size starts unpicked. Add to cart before a size asks for one. Other options start on the first available variant.
- The stock line and, for US shoppers, free shipping from the cart's minimum (see [cart](shopify-cart.md)).
- Size guide swaps the options for the product's size chart, with Back to options. Escape goes back first, then
  closes. A product with no ready chart shows no Size guide.
- View full details links to the product page.

## Loading and errors

The dialog opens straight away at its final size, with skeletons in quick view's own layout, so nothing jumps when the
product arrives. A request that fails says so and links to the product page.

Adding to cart closes quick view and opens the cart drawer. Closing returns focus to the card's button.
