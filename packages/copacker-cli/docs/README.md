# Copacker CLI

The private `@repo/copacker-cli` package supplies the `copacker` executable on Node 24+. It implements the command
vocabulary in [the application spec](../../../apps/copacker/docs/specs/cli/commands.md) through the shared operation client.

**Integration status:** the executable and command adapters exist, together with the first
[server authentication and real-data handlers](../../../apps/copacker/docs/cli-server.md). Account/workspace/schema
discovery and connection reads/settings are implemented. Business-resource handlers and automation issuance remain
unfinished. These changes have not been deployed. Local help works without a server. The CLI checks deployed
schemas and fails before a business write when the server contract is absent or incompatible; command help is not a
claim that a server has enabled that capability. No npm release or deployment has been performed.

## Run locally

```sh
pnpm --filter @repo/copacker-cli cli --help
pnpm --filter @repo/copacker-cli cli product price update --help
pnpm --filter @repo/copacker-cli build
node packages/copacker-cli/dist/bin.js --version
```

After the first server slice is deployed:

```sh
copacker login
copacker workspace list --json
copacker workspace use <workspace-id>
copacker connection list --json
copacker connection settings show <connection-id> --json
```

The remaining planned workflows require their resource handlers before they can run:

```sh
copacker report restock --json
copacker order show 1043 --connection <connection-id> --json
copacker po show <po-id> --json
copacker shipment list --json
copacker product price update <variant-id> --amount 19.95 --currency USD --dry-run --json
copacker product price update <variant-id> --preview <preview-id> --wait --json
copacker inventory update --input reviewed-counts.json --json
copacker order export --file-format csv --wait --output ./orders.csv --json
```

Use `--input file.json` or `--input -` for complete structured inputs and bulk rows. Schemas from `schema show` determine
required revisions, dependencies, allowed fields and permissions. Supplying a field both in JSON and as a flag fails.
There are no generic file, import, job or retry command groups. `order` always means customer orders and `po` means
purchase orders. Supplier catalogs and inventory, partners with a type field, and catalog assignments are represented
in the command inventory.

## Automation and local data

Set `COPACKER_TOKEN` through a protected environment and `COPACKER_WORKSPACE` explicitly. The token overrides stored
credentials; combining it with an explicit profile fails. `COPACKER_API_URL` selects an HTTPS origin, or a loopback HTTP
origin for local development. Stored credentials are never sent to an origin other than their saved profile's origin.
Noninteractive commands cannot use an implicit saved workspace. Actions that send, release, cancel, delete or revoke
require `--yes` noninteractively.

Settings and seven-day execution receipts live in `COPACKER_CONFIG_DIR` or `~/.config/copacker`. Profiles contain an API
origin and optional workspace ID. Receipts contain keys, intent IDs and timestamps, never tokens or business inputs.
Receipt fingerprints include the stable account ID, workspace, API origin, operation, canonical input and upload hash.
Identical reruns reuse the key even after completion. Supply a new `--idempotency-key` for an intentional new execution.
Bulk row order does not change its identity. Relative credential expiry is pinned for a retained issuance intent.
An expired retained intent fails instead of silently acquiring a new key; inspect its entity before deliberately
starting another execution. Old receipt fingerprints contain no business payload and remain as replay-expiry markers.

Interactive secrets use Windows CurrentUser DPAPI, Linux Secret Service (`secret-tool`) or macOS Keychain (`security`).
Missing system credential services fail closed; there is no plaintext fallback. Windows protection is exercised by an
OS-backed test on Windows. Linux/macOS integration still needs native acceptance testing. Never put tokens in arguments.
Credential create/rotate requires `--store-as` or an absolute `--secret-file`; files are created without overwrite and
protected before consuming the one-use delivery. `logout` clears the interactive login and reports failed revocation;
automation credentials use their explicit revoke operation.
Secret delivery has a 30-second deadline covering the response body. A stalled/lost delivery retains the credential ID
in its error receipt so an interactive administrator can inspect, rotate or revoke it; it never requests a new secret
automatically. `schema show account.show` and `schema show workspace.list` work before workspace selection.

## Results and recovery

`report restock` and `restock channel list` have server handlers. Reports support JSON and CSV stdout/local output;
server artifact exports remain unsupported. See [restock behavior and limits](../../../apps/copacker/docs/cli-restock.md).

`--json` writes exactly one success/error envelope to stdout. Progress and execution keys go to stderr. Human detail
output includes nested field destinations. CSV stdout requires the operation's declared tabular projection. Artifact
`--file-format` is independent of stdout `--format`. `--output` writes a temporary sibling, verifies artifact bytes and
uses atomic installation; existing files require `--overwrite`. Downloads and uploads carry bearer authorization only
to the same origin and never follow redirects.

`--all` collects pages into one envelope, retains coverage warnings, and rejects cursor loops or changed snapshots.
`--require-complete` retains the result but exits 8 for incomplete coverage. `--wait` follows only validated read
selectors; a timeout exits 7 without cancelling server work. Partial writes retain per-target results and exit 9.
Other exit codes follow [the contract](../../../apps/copacker/docs/specs/cli/contract.md#results-and-errors).

Uploads use the entity's prepare, authenticated PUT and complete protocol with distinct phase keys. Repeating the
original command uses its original logical intent. `--batch-id` and `--export-id` read through the owning operation.
Confirmed effects are not retried by inventing another command or changing the key.

## Verification and remaining server work

Tests exercise command parsing, duplicate JSON fields, decimal money, stable execution keys, origin isolation,
pagination, partial writes, upload phase keys, download integrity and no-overwrite behavior. The client tests use
contract fixtures; they do not establish live application or provider compatibility.

The [client integration guide](../../copacker-client/docs/README.md) specifies the missing server boundary. The full
initial release additionally requires the application spec's typed domain schemas, permission-aware readers, revisioned
handlers, durable idempotency/outbox storage, supplier identity/stock fixes, listing links, controlled Shopify/Amazon
writes, bulk transactions, entity document handlers and protected credential lifecycle. These have not been replaced
with raw browser-action forwarding or provider credentials in the CLI. Hosted MCP remains a separate adapter.
