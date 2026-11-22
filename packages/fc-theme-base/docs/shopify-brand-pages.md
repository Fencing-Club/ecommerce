# Shopify Brand Pages

A brand's links, the product page's Shop all link and the buying guide's logos, go to the brand's collection: the one
whose handle is the brand's name as a handle (Fencing Club is `/collections/fencing-club`) and that has products.
`snippets/brand-url.liquid` picks the link.

A brand without that collection links to Shopify's vendor page (`/collections/vendors?q=…`). It lists the brand's
products but has no description, and it competes with a real collection in search. Give every brand a collection
with its handle.
