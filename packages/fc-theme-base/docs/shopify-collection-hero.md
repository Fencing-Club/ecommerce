# Shopify Collection Hero

`sections/main-collection-banner.liquid` opens a collection page: breadcrumbs, the title, the collection's
description, a How to choose link to the [buying guide](shopify-buying-guide.md), short trust lines, and tiles for the
categories under this one.

- The description shows in full on desktop. Phones clamp it to three lines with Read more
  (`assets/collection-page.js`), which only appears when the text is cut off.
- The breadcrumbs follow the main menu, so a collection three levels down reads Home, then each level above it.
  A collection that isn't in the menu shows Home and its title.
- Trust lines are section blocks, each an icon and a sentence. Phones leave them out, along with the guide link. A
  block set to show free shipping prints the cart's free US shipping minimum, and only to shoppers who get it (see
  [cart](shopify-cart.md#free-shipping)).
- The tiles are the children of this collection in the main menu, each with its photo and product count. They scroll
  sideways on tablets and become pills on phones. See [collection categories](shopify-collection-categories.md).

Link to the buying guide and Show categories turn those parts off for collections without a guide or a menu branch.
