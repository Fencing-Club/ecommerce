# Shopify Collection Grid

`sections/main-collection-product-grid.liquid` lists a collection's products under its toolbar.

Load more appends the next page to the grid. `assets/collection-load-more.js` fetches the next page through the
section rendering API, adds its products, and swaps in that page's link, or removes the button after the last page.
The link is an ordinary page link, so it still works before the script runs, and the script follows it if a request
fails. The address bar keeps the first page, so a reload starts from the top of the collection.

Each product is the shared [product card](shopify-product-card.md).

When filters exclude everything, the empty state offers Clear all filters and Browse all products. Each label is a
section setting.
