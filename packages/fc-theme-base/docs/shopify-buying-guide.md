# Shopify Buying Guide

`sections/collection-buying-guide.liquid` closes a collection page with how to choose, under the anchor the hero's
How to choose link and the toolbar's level help point at.

- **Levels** are section blocks, one row per protection level: its badge, what it means, where it's worn, and a Shop
  link. The link defaults to this collection filtered to that level, built from the badge label, so 800N FIE adds
  both the rating and the FIE filter.
- **Questions** are section blocks shown as plain FAQ items, with FAQPage structured data for search engines.
- **Popular** links come from a menu picked in the section, for curated filtered pages.
- **Brands** are the logos of the brand entries matching this collection's vendors. A vendor without a brand entry or
  logo is left out.

Popular links and brands leave their column out when there's nothing to show. On phones the level rows become
cards.
