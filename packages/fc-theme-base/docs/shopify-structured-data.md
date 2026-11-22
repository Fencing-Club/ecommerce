# Shopify Structured Data

The theme writes JSON-LD for search engines from Shopify data. **Enable custom structured data** in the theme settings
turns it all on or off; turn it off only when an app writes the store's JSON-LD instead.

## Where it comes from

- `snippets/structured-data.liquid`, in the layout's head: the page node (WebPage, ItemPage, CollectionPage, AboutPage
  or ContactPage) and the page's main entity: Product or ProductGroup, Blog, BlogPosting. The homepage adds the
  WebSite and the store (OnlineStore) with its return policy and shipping service. Collection pages render it from
  the product grid section instead, so it can list that page's products.
- `snippets/ui-breadcrumbs.liquid`: every visible breadcrumb trail writes the same trail as a BreadcrumbList, so the
  breadcrumbs in search results always match the page. A page without visible breadcrumbs has none. Render the trail
  once per page.

## Policies

The return policy and shipping service link to the page set in the `structured_data` shop metafields, else the theme's
own policy pages (`/pages/refund-policy`, `/pages/shipping-policy`), else Shopify's legal policies. A policy with no
page gets no markup.

Return windows, fees, handling and transit times come from the same metafields. Without them the snippet uses fallback
facts at its top, which must match what the policy pages say.

## Checking

Run a page through Google's Rich Results Test after changing the snippets. The unit tests in
`tests/structured-data-liquid.test.js` check that the homepage graph stays valid JSON with any mix of policies and that
the breadcrumb markup matches the visible trail.
