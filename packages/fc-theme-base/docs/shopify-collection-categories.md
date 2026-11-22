# Shopify Collection Categories

`snippets/collection-category-tree.liquid` draws a collection's place in the store's categories from the main menu,
which nests up to three levels. A collection that isn't in the menu shows no categories.

It has three styles:

- **Tiles**, in the [hero](shopify-collection-hero.md): the categories one level under this collection.
- **Tree**, at the top of the [filters](shopify-collection-filters.md): a link up to all equipment, then this
  collection's whole top-level branch. The branch holding this collection starts open; others open with their arrow.
- **Parent**, in an empty collection: one Shop all link to the category above.

Each category shows its product count. Menu links on the store aren't always collection links, so the snippet finds
each collection by the last part of its link's address. Categories with no products are left out, unless one is the
current page.
