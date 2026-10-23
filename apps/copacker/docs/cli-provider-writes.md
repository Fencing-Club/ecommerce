# Controlled provider writes

Buyer SKU changes target Shopify only. Cost reuses the existing Shopify unit-cost adapter. Price changes update
Shopify first and every linked Amazon US offer after source confirmation. The initial money basis is USD; a missing
or different currency is rejected. A non-1:1 pack or Shopify bundle requires an explicit target price per Amazon listing.
No Amazon SKU rename, automatic currency conversion or continuous channel synchronization is implemented.

`product show` returns each variant's write policy, connection revision and listing guards. `product listing show`
returns the canonical offer ID and, for FBM, an availability location ID. `inventory list` includes these linked offer
balances as `channel_availability`, separate from physical stock. Restock planning never pools them as warehouse stock.
Capabilities describe eligibility; preview checks actual provider scopes, values and current location ownership.

```sh
copacker product variant update <variant-id> --sku NEW-SKU --dry-run --json
copacker product price update <variant-id> --amount 12.00 --currency USD --dry-run --json
copacker product cost update <variant-id> --amount 4.25 --currency USD --dry-run --json
copacker inventory update <variant-id> --location <location-id> --state available --quantity 20 --dry-run --json
copacker product price update --preview <preview-id> --yes --wait --json
```

Structured input for a price with an explicit six-pack offer:

```json
{
  "mode": "preview",
  "variantId": "<account-scoped Shopify variant ID>",
  "change": {
    "field": "price",
    "amountMinor": 1200,
    "currency": "USD",
    "targetPrices": [{ "listingId": "<listing UUID>", "amountMinor": 6500, "currency": "USD" }]
  }
}
```

Preview fills missing source guards from provider reads and retains the exact destinations for 24 hours. Apply accepts
only `previewId` and an optional matching variant ID; it rechecks dependencies and joins an already accepted execution.
Direct mode requires `expectedConnectionRevision` and the expected source value (`expectedSku`, `expectedAmountMinor`
or `expectedQuantity`). `expectedLinks` contains every affected listing's ID, observation revision and link revision.
Local metadata and supplier count contracts remain separate branches; do not mix local fields and provider changes.

Inventory writes require an explicit location and quantity state. Shopify writes use the existing location selection
and classification, allow only tracked non-bundle merchant locations, and send `changeFromQuantity` plus an idempotency
key. App-owned/mirror locations, FBA and AWD are read-only. Amazon FBM accepts only `available` at `listing:<id>` after
explicit manual ownership is recorded on its link. This is seller-offer units, not warehouse pieces. The ownership flag
does not disable another application's sync; keep externally controlled offers marked external.

Execution is retained before dispatch. All targets are preflighted before the first effect and again individually
before sending. Requests to the same provider field serialize across CLI executions; an overlapping new execution
returns `write_in_progress`. A source failure prevents dependent channel writes. Accepted Amazon submissions remain
pending until readback confirms the desired value. Results report every destination and partial outcomes.

Repeating the same execution key polls the retained intent; it does not blindly resend a write. A timeout or interrupted
dispatch becomes `outcome_unknown` / `needs_attention` and retains its field lock. Neither an expired worker lease nor
one unchanged read proves the request cannot still apply. Investigate uncertain provider outcomes before any operator
reconciliation; there is deliberately no automatic unlock or retry command. A known rejected execution can be reviewed
again using a new preview/key. This slice rejects overlapping desired generations rather than automatically superseding
older queued work. General bulk writes, automatic supersession, inventory adjustments and automatic reconciliation of
unknown outcomes remain outside this slice.

These guards serialize Copacker CLI executions, not another app or a human editing a provider. Shopify inventory has
provider compare-and-swap; SKU, cost, price and Amazon availability use expected-value preflight and readback, which
cannot provide a provider-side transaction. Monetary results require current price permission, including receipt replay.
Credentials stay on the server. The worker rechecks the submitting user's membership and grant before each dispatch.

Provider references: [Shopify inventory quantities](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/inventorySetQuantities),
[Amazon listing model](https://github.com/amzn/selling-partner-api-models/blob/main/models/listings-items-api-model/listingsItems_2021-08-01.json).
