# Shopify Meta Tags

`layout/theme.liquid` writes the page's title, description, icons and canonical link. `snippets/meta-tags.liquid`
writes the Open Graph and X tags that link previews use. [Structured data](shopify-structured-data.md) has its own
page.

## Title and description

- The title is the page's title, then the tags it's filtered by, the page number past the first, and the shop's name
  when the title doesn't already include it.
- The description is the one Shopify gives the page. A collection or blog without one gets a sentence from
  `snippets/meta-description.liquid`: a collection names how many products it shows and up to three brands, and a
  blog names its latest article. A description written in Shopify, in the SEO fields or the page's own text, always
  wins.
- Link previews use the same description, or the shop's description on pages without one.

## Robots

Shopify's automatic vendor and type pages (`/collections/vendors?q=…`, `/collections/types?q=…`) carry
`noindex, follow`: search engines follow their links but leave them out of results, since they have no description
and compete with real collections. Every other page is indexable.

## Icons and social

- The favicon is served at 96px for search results and 180px for phones' home screens.
- `twitter:site` reads the handle from the X profile link in the theme settings, on twitter.com or x.com.

`tests/seo-liquid.test.js` checks the description sentences and the X handle.
