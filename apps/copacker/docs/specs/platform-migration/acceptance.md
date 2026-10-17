# Cloudflare cutover acceptance

Release source: `52183dec13baa80029a8788dd58f3a25a4365fc2`, merged in [PR 23](https://github.com/AndrewCraswell/ecommerce/pull/23).
Qualification and cutover took place October 16, 2026, America/Los_Angeles; the final workflow timestamps are October 17 UTC.
See [architecture](architecture.md) for the previous platform, release target and retained execution boundary.

## Release evidence

| Check | Result |
| --- | --- |
| Repository verification | `pnpm verify` passed: format, lint, types, unused code and coverage. Copacker: 318 files, 2,490 tests |
| Hosted PR preview | 145 browser tests passed, six intentional skips, on the preview source `de3c9e361e3bc205a6f56745c2fb369166fd993d` |
| Staging deployment | [CI 38983183587](https://github.com/AndrewCraswell/ecommerce/actions/runs/38983183587) passed, including web, Storybook, retained executor, scheduler and signed-out smoke checks |
| Stable staging domains | Application and Storybook report the release source; HTTPS, built assets, private cache policy and anonymous download denial passed |
| Full staging qualification | 145 browser tests passed, six intentional skips, in 4.9 minutes against dedicated staging workspaces |
| First production promotion | [38985688726](https://github.com/AndrewCraswell/ecommerce/actions/runs/38985688726) cancelled after live eBay webhook failures; production web restored to Railway `79b233a5adaefedb5ab3432384ae57fe9b01098c` |

The browser suite covered buyer, supplier and forwarder workflows; purchase orders and revisions; fulfillment and
offline suppliers; landed costs; private documents and product labels; CSV/Excel imports and exports; catalogues;
restock search; settings; authentication; role boundaries; and mobile navigation. Google sign-in also completed in the
integrated browser on the preview and stable staging domain. Hosted Storybook rendered its manager and restock story.

The six skips are intentional suite conditions, including paid document extraction, real invitation email, alternative
desktop/mobile navigation and a supplier empty-state case after earlier tests create products. They are not proof of
real merchant writes, email delivery or paid AI processing. Staging's four rejected email jobs used the dedicated test
recipient; its two Shopify 404 jobs used the seeded fake demo store. Every new failed job belonged to the qualification
workspace. The executor consumed the wake signals, leaving no pending/running SQL jobs or dead-letter backlog.

The staging Cloudflare error query returned one expected `/partners` response from the forwarder access-denial test. No
unexpected runtime exception or database-pool timeout appeared in that query. Queue metrics are approximate; a zero
message count does not imply every byte metric is immediately zero.

## First production attempt and correction

The brief production deployment preserved the existing signed-in session, product search and the private PO36 PDF
(67,707 bytes; SHA-256 `31c5a7d62c1fc8378625c0d94fae8d65fa20b4c568aa306b3e01ffd4cb6da7b8`). However, live
eBay notifications returned 500 before reaching EventBridge. Promotion stopped before replacing the retained executor.
Production web was restored to its previous Railway CNAME and its health endpoint confirmed the previous commit.
Storybook remains on Cloudflare; database, private files, queues and Hyperdrive were unchanged by the rollback.

Vite's default Node SSR target selected the AWS client's Node runtime configuration while Cloudflare selected browser
exports from its dependencies. AWS's Node-only version-warning export became a Symbol, failing during client
construction. The correction selects the `webworker` SSR target and supplies AWS region and credentials explicitly.
A regression check executes the exact built application in workerd, verifies a synthetic eBay signature and captures
the signed EventBridge HTTP request. It also checks unsigned rejection, failed AWS entries and subsequent recovery.
All network traffic is intercepted, with no real credentials or merchant writes. The original artifact reproduced
the production failure under this check. Qualification of the corrected artifact is pending.

## Infrastructure operations

Both saved plans were reviewed and applied from the release source. The only planned replacement was the local
`terraform_data.tags` reconciler; neither bucket nor queue was replaced.

| Environment | Plan | Exact plan SHA-256 | Successful apply |
| --- | --- | --- | --- |
| Staging | [38985142388](https://github.com/AndrewCraswell/ecommerce/actions/runs/38985142388) | `6ecc7f9f1a70a6ebde129c26cd87c5f31319622e0065d76fa73288e282e5300f` | [38985290782](https://github.com/AndrewCraswell/ecommerce/actions/runs/38985290782) |
| Production | [38985144538](https://github.com/AndrewCraswell/ecommerce/actions/runs/38985144538) | `432ee43a70617d3842f235e941babf2c86dca05736f3c858537500bf35ecf483` | [38985292798](https://github.com/AndrewCraswell/ecommerce/actions/runs/38985292798) |

Each apply verified state backups before and after the operation by reading back bytes and opening the saved state
with Terraform in isolation. The six-hour backup schedule is enabled. This verifies Terraform state recovery
readability, not a database restore or document-content backup.

The approved `copacker-infrastructure` account token is stored only as `CLOUDFLARE_API_TOKEN` in GitHub's
`infrastructure` environment. It has R2 Storage, Queues and Tag write permissions and expires October 16, 2027.
The release token is separate. Required GitHub reviewers are not configured; manual dispatch binds promotion to an
explicit tested commit and infrastructure apply to an unexpired saved plan and unchanged state.

## Recovery and remaining scope

The one-time hostname handoff required removing each exact saved Railway CNAME before attaching the published Worker
custom domain. Cloudflare returned error 100117 while those records remained. Each handoff checked the published
release and unchanged DNS first, retained the previous record, and could restore it if attachment failed. Subsequent
releases use the existing Cloudflare custom-domain bindings. Production web needs a fresh handoff after its rollback:
the rejected stateless Worker was removed, then the retained Railway record recreated. The new DNS record ID is saved
in the private rollback evidence; the original pre-cutover ID must not be reused.

Keep the previous Railway web/Storybook artifacts, original document objects and database recovery material through
at least one daily reconciliation cycle. Do not retire them automatically. Frozen database recovery branches expire
October 23, 2026 at 21:00 UTC; normal Neon history was six hours at verification. Returning to old storage requires
reconciling new R2 writes. The retained Node executor remains on Railway; moving it to Cloudflare execution is separate
work. The deferred `pr-999999` Railway bucket is also untouched.

Private state, plans, credentials, logs and recovery evidence are kept outside the repository. PR 23's temporary
Cloudflare/Neon/R2 preview resources were removed by its successful cleanup rerun.
