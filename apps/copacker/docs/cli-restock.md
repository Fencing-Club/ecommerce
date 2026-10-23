# CLI restock reports

The operations API implements `restock.channel.list` and `report.restock` for buyer members with Restock access.
It calls the existing `restockAllChannels` service and planner. Provider collectors and parsers remain in
`copacker-marketplaces`; no provider calls, demand arithmetic, PO coverage or packing rules are copied into the CLI.

```sh
copacker restock channel list --json
copacker report restock --json
copacker report restock --channel amazon --sku SKU-1 --days 60 --lead-time-days 45 --json
copacker report restock --state blocked --json
copacker report restock --format csv --output restock.csv
```

Report creation declares a local write and requires an idempotency key, supplied by the CLI. Repeating the same
execution returns the retained report and its original coverage metadata. Changed permissions reject replay.
Channel discovery marks destinations ineligible until the Shopify catalog is available.

Omitted channels select every eligible channel. Use returned channel keys verbatim: `amazon` or
`shopify:gid://shopify/Location/...`. `--channel` is repeatable; empty, duplicate and inaccessible selections fail.
Days and lead time default to workspace settings, with a supplier's lead time taking precedence. SKU filtering is
exact and case-sensitive. Supplier filtering uses the buyer's active supplier link ID. Unknown suppliers fail rather
than being confused with an empty result. Status and SKU filters can legitimately return zero rows.

Reports include rows with no supplier, which the browser's supplier-grouped report hides. Their explanations say why
they cannot become POs. Prices and derived monetary values use the browser's shared redaction function. Redacted fields
are null and listed in `meta.redactedFields`; retained reports contain the same redacted payload.

The report includes stored inventory snapshot references/revisions, per-source sales windows and attribution gaps,
per-row open-PO references and lead-time origin. These are evidence, not a complete dependency graph for creating POs.
Missing demand stays null and blocks recommendations. Missing Amazon pools, failed stock refreshes, unavailable demand
or attribution gaps mark the report partial. `--require-complete` makes the CLI exit 8 for such reports. Inventory
timestamps come from the snapshot data itself, never the request time or the latest failed refresh. Freshness is
unknown unless a failed refresh makes it explicitly stale; no fresh-provider verification is implied.

Each new execution retains its exact result and metadata under a new report ID for a 24-hour validity period. It makes no
reservation, provider change or PO. Expired records in that workspace are removed on subsequent report generation;
workspace deletion cascades and account deletion removes the user's retained reports. Same-key replays return the original report until expiry. Receipts retain only its ID, not a second copy of report data;
an expired or removed report cannot be replayed. The receipt remains an expiry marker so its key cannot create another
report. There is no separate report read operation yet. Reports exceeding 10,000 rows
or 24 MiB fail with `result_too_large` rather than silently dropping rows.

## Boundaries of this implementation

The [proposed purchasing contract](specs/cli/operations/purchasing.md) includes capabilities beyond the current data
model. Executable discovery describes the supported shape:

- `identityBasis: "provider"`: product/variant/location fields retain Shopify IDs. Each row's `source` scopes them to
  its Copacker connection and provider account. Channel keys are not canonical UUIDs.
- `targetBasis: "pooled"`: Amazon uses the existing single pooled target and inbound/open-PO reconciliation.
  It does not invent separate FBA/AWD target allocations. Missing pools are surfaced as incomplete coverage.
- There are no canonical product IDs, immutable sales coverage IDs or full dependency validation
  yet. A retained report is not a consumable purchase plan. Plan and create-PO operations remain undiscoverable.
- JSON envelopes and declared CSV stdout/local output work. `--file-format`/`--export-id` server artifact exports remain
  unsupported and fail schema validation before execution.

The restock-report retention table requires its generated forward migration through the CI release gate. No local
migration is run or tested. Tests build the current schema directly and exercise the real dispatcher/client and planner.

## Targets with selected pools

`copacker report restock targets --days 56 --lead-time-days 56 --json` calculates one row per saved variation target.
It uses explicit member lists, pools raw demand and balances before MOQ/case rounding, and returns assignment and
availability issues. This live report is not retained and does not choose a shipping destination. Unresolved imports
make the result partial. See [stock targets](stock-targets.md) for connection selection, migration and existing-screen
behavior. Connection inventory changes use `connection inventory update` with JSON input and a current revision.
