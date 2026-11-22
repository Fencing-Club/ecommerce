# Shopify Collection Grid

`sections/main-collection-product-grid.liquid` lists a collection's products under its toolbar, with the
[filters](shopify-collection-filters.md) in a sidebar on desktop and a drawer on tablets and phones. Each product is
the shared [product card](shopify-product-card.md).

## Toolbar

`snippets/collection-toolbar.liquid` holds Hide filters, the protection level chips, the product count, sorting, and
the choice of three or four products per row. Hide filters and products per row are desktop only; this browser
remembers both (`assets/collection-page.js`). On phones the toolbar becomes Filters and Sort side by side, the chips
underneath, then the count. The band sticks to the top of the window on desktop.

## Load more

Below the grid, Showing X of Y and a progress bar sit over Load more, which appends the next page.
`assets/collection-load-more.js` fetches it through the section rendering API, adds its products, and swaps in that
page's link, or removes the button after the last page. The link is an ordinary page link, so it still works before
the script runs, and the script follows it if a request fails. The address bar keeps the first page, so a reload
starts from the top of the collection.

## No results

`snippets/collection-no-results.liquid` replaces the grid when it's empty. With filters on, it offers removing one
of up to three filters in use, each with how many products that brings back, then Clear all filters and Ask us to
find it, which goes to the section's contact page. The collection's best sellers follow. The script loads the counts
and best sellers through the section rendering API, and leaves them out if a request fails.

A collection with nothing in it at all says new gear is on its way and links one level up the category menu.
