# CLI listing identities

Amazon US listings are stored separately from Shopify products and historical costing mappings. Discovery includes
unmatched offers: an absent Shopify SKU match does not hide a listing. Run `connection sync <id> --dataset products`,
then inspect the returned run through `connection sync show`. This reuses the existing authenticated Amazon client,
durable jobs and Workflow delivery.

`product listing list` supports connection, marketplace, seller SKU, unlinked and variant filters. `show` returns the
account-scoped listing identity, observed values, observation revision, link revision and write capabilities. These
are stored observations, not live reads or a guarantee of complete catalog coverage. Price values require price access.
Retired listings remain visible with `active: false`; listings from replaced accounts are hidden.
Decimal prices accept exact exponent forms and trailing zeros. Unsupported currency or sub-cent precision leaves the
price unavailable instead of hiding the whole catalog. Price dispatch requires a supported live USD cent value.

```sh
copacker product listing list --unlinked --json
copacker product listing link <listing-id> --revision 1 --link-revision 0 --variant <variant-id> --pieces-per-listing 1
copacker product listing unlink <listing-id> --revision 1 --link-revision 1
```

Links reference the current Shopify variant's account-scoped ID, never its mutable SKU. Both observation and link
revisions are required. Explicitly unlink before selecting a different variant. Refreshes preserve links; missing offers
are retired only after complete pagination. Replaced accounts, ambiguous observations and pagination loops fail closed.
Pack conversion describes inventory units; it does not authorize inventing a pack's selling price.

Inventory ownership defaults to `external`. `--inventory-owner manual` is allowed only for merchant-fulfilled offers
and records intended routing; it does not disable another application's synchronization or enable a write. FBA/AWD
remain reported stock. Offer availability is not a physical warehouse count and is excluded from restock totals.

The following [controlled provider-write slice](cli-provider-writes.md) adds retained previews, per-target execution,
permission/dependency checks and conservative dispatch recovery. Capabilities require that server release; the original
listing-discovery release remains read-only upstream. Amazon SKU renaming has no adapter. Provider credentials remain
on the server.
