# Shopify Recently Viewed

`sections/recently-viewed.liquid` shows the products this shopper looked at last, newest first. The list lives in
their browser (`assets/recently-viewed.js`), so it needs no account.

Product pages add to the list. The section reads each product's current title, photo and price from Shopify's
product JSON, so a changed price shows correctly, and drops products that no longer exist. It stays hidden until
there's something to show, leaves out the product being viewed, and Clear empties the list.

Products to show is a section setting. The section can go on collection, product and search pages.
