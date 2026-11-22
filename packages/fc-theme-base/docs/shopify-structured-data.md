# Shopify Structured Data

The theme writes JSON-LD for search engines from Shopify data. **Enable custom structured data** in the theme settings
turns it all on or off; turn it off only when an app writes the store's JSON-LD instead.

## Where it comes from

- `snippets/structured-data.liquid`, in the layout's head: the page node (WebPage, ItemPage, CollectionPage, AboutPage
  or ContactPage) and the page's main entity: Product or ProductGroup, Blog, BlogPosting. The homepage adds the
  WebSite and the store (OnlineStore) with its return policy, shipping service and every social profile the theme
  settings link. Collection pages and the collection list render it from their sections instead, so it can list the
  products or collections that page shows.
- `snippets/ui-breadcrumbs.liquid`: every visible breadcrumb trail writes the same trail as a BreadcrumbList, so the
  breadcrumbs in search results always match the page. A page without visible breadcrumbs has none. Render the trail
  once per page.

## Products

Variants share the group's description. The rating comes from Shopify's standard `reviews.rating` and
`reviews.rating_count` product fields, which the reviews app (Judge.me) fills and the product page shows as stars. A
product without reviews gets no rating.

Judge.me can write its own Product JSON-LD, which would give the page a second product. Turn off its JSON-LD snippets
in Judge.me under **Settings**, **Google, SEO and AI**, **SEO Rich Snippets**.

## Articles

An article written from the shop's own account, or with no author, credits the store. Any other author is a person.

## Policies

The return policy and shipping service link to the page set in the `structured_data` shop metafields, else the theme's
own policy pages (`/pages/refund-policy`, `/pages/shipping-policy`), else Shopify's legal policies. A policy with no
page gets no markup.

Return windows, fees, handling and transit times come from the same metafields. Without them the snippet uses fallback
facts at its top, which must match what the policy pages say.

## Checking

Run a page through Google's Rich Results Test after changing the snippets. `tests/seo-liquid.test.js` checks the
markup's logic: valid JSON with any mix of policies, breadcrumbs that match the visible trail, ratings, article
authors and the collection list.
