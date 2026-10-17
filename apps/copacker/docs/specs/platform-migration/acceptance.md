# Cloudflare cutover acceptance

Final accepted production source: `713bbcca2130f093bfc02fb1521ea8397be4b16b`, merged in [PR 26](https://github.com/AndrewCraswell/ecommerce/pull/26).
The successful web cutover began with `1c54fdf22ddea8d03d25db60fd6b3b9409094f12` from [PR 24](https://github.com/AndrewCraswell/ecommerce/pull/24).
The initial release was `52183dec13baa80029a8788dd58f3a25a4365fc2` from [PR 23](https://github.com/AndrewCraswell/ecommerce/pull/23).
Qualification and cutover took place October 16–17, 2026, America/Los_Angeles; provider timestamps use UTC.
See [architecture](architecture.md) for the previous platform, accepted current state and retained execution boundary.

## Release evidence

| Check | Result |
| --- | --- |
| Repository verification | `pnpm verify` passed on the final `713bbcc` source: format, lint, types, unused code and coverage. Copacker: 318 files, 2,491 tests |
| Original hosted PR preview | 145 browser tests passed, six intentional skips, on the preview source `de3c9e361e3bc205a6f56745c2fb369166fd993d` |
| Corrected PR | [CI 38987354302](https://github.com/AndrewCraswell/ecommerce/actions/runs/38987354302) passed; integrated-browser Google sign-in completed on preview source `ce194ef0123912b868a50627109217c42b704ed9` |
| Corrected staging deployment | [CI 38990265903](https://github.com/AndrewCraswell/ecommerce/actions/runs/38990265903) passed, including web, Storybook, retained executor, scheduler and signed-out smoke checks |
| Stable staging domains | Application and Storybook report the release source; HTTPS, built assets, private cache policy and anonymous download denial passed |
| Full corrected staging qualification | 145 browser tests passed, six intentional skips, in 5.2 minutes against fresh dedicated staging workspaces; no retries |
| Final staging qualification | [CI 39012124790](https://github.com/AndrewCraswell/ecommerce/actions/runs/39012124790) passed for `713bbcc`; the full hosted suite then passed 145 tests with six intentional skips in 3.7 minutes, without retries |
| First production promotion | [38985688726](https://github.com/AndrewCraswell/ecommerce/actions/runs/38985688726) cancelled after live eBay webhook failures; production web restored to Railway `79b233a5adaefedb5ab3432384ae57fe9b01098c` |
| Successful production promotion | [38992255349, attempt 2](https://github.com/AndrewCraswell/ecommerce/actions/runs/38992255349) passed for `1c54fdf`; app, Storybook, retained executor, scheduler and release smoke checks completed |
| Final production promotion | [39013181141](https://github.com/AndrewCraswell/ecommerce/actions/runs/39013181141) passed for `713bbcc` on its first attempt; app, Storybook, executor and scheduler deployed, followed by 44 passing read-only smoke tests and two conditional skips |
| Production browser acceptance | Existing session survived; 188 products and 589 variations loaded; search, desktop/mobile navigation and the private PO36 download passed |
| Live eBay delivery | One synthetic `ORDER_CONFIRMATION` test was accepted by eBay, returned HTTP 204 from Copacker, reached EventBridge with HTTP 200 and was consumed by the Railway executor |

The browser suite covered buyer, supplier and forwarder workflows; purchase orders and revisions; fulfillment and
offline suppliers; landed costs; private documents and product labels; CSV/Excel imports and exports; catalogues;
restock search; settings; authentication; role boundaries; and mobile navigation. Google sign-in also completed in the
integrated browser on the preview and stable staging domain. Hosted Storybook rendered its manager and restock story.

The six skips are intentional suite conditions, including paid document extraction, real invitation email, alternative
desktop/mobile navigation and a supplier empty-state case after earlier tests create products. They are not proof of
real merchant writes, email delivery or paid AI processing. Staging's four rejected email jobs used the dedicated test
recipient; its two Shopify 404 jobs used the seeded fake demo store. Every new failed job belonged to the qualification
workspace. The executor consumed the wake signals, leaving no pending/running SQL jobs or dead-letter backlog.

The successful repeat's Cloudflare error query returned one expected `/partners` response from the forwarder
access-denial test and six telemetry entries for two interrupted server-function requests during authentication.
Neither interruption failed a test; no database-pool timeout appeared. The first corrected staging run had two browser
timeouts at the same moment: pending filter requests and a packing-list response that Cloudflare recorded as HTTP 200
in 1.2 seconds. Its traces and logs were preserved. Repeating the unchanged build with fresh workspaces passed every
applicable test, including both affected workflows. This supports a transient connection failure rather than a
reproducible application defect. Queue metrics are approximate; a zero message count does not imply every byte metric
is immediately zero.

## First production attempt and correction

The brief production deployment preserved the existing signed-in session, product search and the private PO36 PDF
(67,707 bytes; SHA-256 `31c5a7d62c1fc8378625c0d94fae8d65fa20b4c568aa306b3e01ffd4cb6da7b8`). However, live
eBay notifications returned 500 before reaching EventBridge. Promotion stopped before replacing the retained executor.
Production web was restored to its previous Railway CNAME and its health endpoint confirmed the previous commit.
Storybook remained on Cloudflare; database, private files, queues and Hyperdrive were unchanged by the rollback.

Vite's default Node SSR target selected the AWS client's Node runtime configuration while Cloudflare selected browser
exports from its dependencies. AWS's Node-only version-warning export became a Symbol, failing during client
construction. The correction selects the `webworker` SSR target and supplies AWS region and credentials explicitly.
A regression check executes the exact built application in workerd, verifies a synthetic eBay signature and captures
the signed EventBridge HTTP request. It also checks unsigned rejection, failed AWS entries and subsequent recovery.
All network traffic is intercepted, with no real credentials or merchant writes. The original artifact reproduced
the production failure under this check. The corrected artifact passed the regression, repository verification,
PR CI, main CI and full hosted staging qualification.

## Successful production cutover

The corrected Worker was attached to `copacker.ai`, and the release workflow completed successfully. The existing
signed-in browser session still loaded the production catalogue and purchase order. The PO36 PDF remained exactly
67,707 bytes with the same SHA-256 recorded above. Desktop and mobile layouts, product search and keyboard navigation
were inspected in the integrated browser without creating production business records.

eBay accepted one synthetic order-notification test with HTTP 202 and notification ID
`8ecc2e20-fe8e-426e-8ced-df801662714b`. Cloudflare recorded the webhook's HTTP 204 and the signed EventBridge request's
HTTP 200; the retained executor logged consumption of the same notification. Correlation uses that identifier because
the workstation and provider clocks differed slightly. The account-deletion topic was never manually triggered.
Production job failure counts were unchanged, with no pending/running SQL jobs and no wake-queue or dead-letter backlog
at the post-release check.

Production traces then exposed a separate maintenance-flag warning: Cloudflare rejects `fetch` with `redirect: "error"`
before sending the request. [PR 25](https://github.com/AndrewCraswell/ecommerce/pull/25) uses `manual` and preserves the
last flag setting on non-success responses. A regression against the actual built Worker reproduced the old failure
and verifies enabled maintenance, missing flags and redirect rejection. Twenty focused maintenance tests and the full
`pnpm verify` passed, including 2,491 Copacker tests; [PR CI 38993225040](https://github.com/AndrewCraswell/ecommerce/actions/runs/38993225040)
also passed all verification, browser, Storybook and hosted-preview gates. WorkOS had no `maintenance` flag in either
environment at inspection; the checks did not create or toggle a live flag.

The maintenance fix reached staging as `c1d7522b6d30d9017e33e2927094f21170232b2a` through successful
[CI 38994680087](https://github.com/AndrewCraswell/ecommerce/actions/runs/38994680087). Its full hosted run passed 144
tests with six intentional skips and one genuine failure: deleting a draft removed its database record but sometimes
left the cached order list showing it. The action returned HTTP 200; a read-only database query confirmed deletion.
The trace and failed screenshot were preserved, and production promotion was held.

[PR 26](https://github.com/AndrewCraswell/ecommerce/pull/26) waits for destination navigation and synchronous loader
invalidation after deletion. Its browser regression holds the client clock fixed, keeping the visited list fresh so
the mutation must explicitly refresh it. The focused test passed against a local built Worker and isolated database.
Integrated-browser checks confirmed desktop and phone list updates, keyboard dismissal and remaining draft rows.
[PR CI 38996506414](https://github.com/AndrewCraswell/ecommerce/actions/runs/38996506414) passed all checks and hosted
preview publication. This correction is merged as `713bbcca2130f093bfc02fb1521ea8397be4b16b`.

The final staging qualification passed all 145 applicable tests, including the strengthened deletion regression.
The maintenance endpoint returned HTTP 200 with `active: false`; its observed telemetry contained no maintenance
refresh warning. The error query contained the expected forwarder `/partners` denial and six entries for two
interrupted server-function requests, with no failed browser test or database-pool timeout. All six new failed jobs
were from the dedicated qualification workspaces: four rejected emails to the test recipient and two Shopify requests
against the fake demo store. No SQL jobs remained pending or running, and wake and dead-letter queue counts were zero.

The final production promotion completed October 17 at 07:23 UTC. Application and Storybook health both reported
`713bbcc`. The integrated browser retained its existing session, loaded 188 products and 589 variations, searched the
catalogue and inspected the desktop and phone layouts and keyboard dismissal. The private PO36 download still matched
the original byte count and SHA-256. The maintenance endpoint returned HTTP 200 with `active: false`, and its observed
telemetry contained no refresh warning. Production's error query returned no errors; failed-job counts were unchanged,
with no pending/running SQL jobs or queue backlog.

One final synthetic `ORDER_CONFIRMATION` test was accepted with HTTP 202 and notification ID
`36e9160a-a0e7-45b5-87ae-aee4e883d10f`. Its exact trace recorded the webhook's HTTP 204 and EventBridge's HTTP 200.
The retained executor deployment `15653557-64ba-42b8-af26-3b4aef67cf5a` logged the same notification at
07:24:06 UTC. No production business record or account-deletion test was created.

## Infrastructure operations

Both saved plans were reviewed and applied from the release source. The only planned replacement was the local
`terraform_data.tags` reconciler; neither bucket nor queue was replaced.

| Environment | Plan | Exact plan SHA-256 | Successful apply |
| --- | --- | --- | --- |
| Staging | [38985142388](https://github.com/AndrewCraswell/ecommerce/actions/runs/38985142388) | `6ecc7f9f1a70a6ebde129c26cd87c5f31319622e0065d76fa73288e282e5300f` | [38985290782](https://github.com/AndrewCraswell/ecommerce/actions/runs/38985290782) |
| Production | [38985144538](https://github.com/AndrewCraswell/ecommerce/actions/runs/38985144538) | `432ee43a70617d3842f235e941babf2c86dca05736f3c858537500bf35ecf483` | [38985292798](https://github.com/AndrewCraswell/ecommerce/actions/runs/38985292798) |

Each apply verified state backups before and after the operation by reading back bytes and opening the saved state
with Terraform in isolation. The six-hour backup schedule is enabled; scheduled
[run 39004312175](https://github.com/AndrewCraswell/ecommerce/actions/runs/39004312175) succeeded for both environments,
including byte verification and isolated restore reads. This verifies Terraform state recovery
readability, not a database restore or document-content backup.

The approved `copacker-infrastructure` account token is stored only as `CLOUDFLARE_API_TOKEN` in GitHub's
`infrastructure` environment. It has R2 Storage, Queues and Tag write permissions and expires October 16, 2027.
The release token is separate. Required GitHub reviewers are not configured; manual dispatch binds promotion to an
explicit tested commit and infrastructure apply to an unexpired saved plan and unchanged state.

## Recovery and remaining scope

The one-time hostname handoff required removing each exact saved Railway CNAME before attaching the published Worker
custom domain. Cloudflare returned error 100117 while those records remained. Each handoff checked the published
release and unchanged DNS first, retained the previous record, and could restore it if attachment failed. Subsequent
releases use the existing Cloudflare custom-domain bindings. After the first rollback, the successful second handoff
validated the corrected Worker and removed the recreated Railway record. Production now routes to the Worker; the
old DNS record IDs are historical evidence and must not be reused for a future operation.

Keep the previous Railway web/Storybook artifacts, original document objects and database recovery material through
at least one daily reconciliation cycle. Do not retire them automatically. Frozen database recovery branches expire
October 23, 2026 at 21:00 UTC; normal Neon history was six hours at verification. Returning to old storage requires
reconciling new R2 writes. The retained Node executor remains on Railway; moving it to Cloudflare execution is separate
work. The deferred `pr-999999` Railway bucket is also untouched.

Private state, plans, credentials, logs and recovery evidence are kept outside the repository. PR 23's temporary
Cloudflare/Neon/R2 preview resources were removed by its successful cleanup rerun. PR 24's preview cleanup also passed
on its second attempt, [38990266087](https://github.com/AndrewCraswell/ecommerce/actions/runs/38990266087).
PR 25's cleanup also passed on retry, [38994679941](https://github.com/AndrewCraswell/ecommerce/actions/runs/38994679941),
after an initial file-deletion failure. The cleanup verified resource absence before removing the Neon branch.
PR 26's cleanup likewise succeeded on its second attempt,
[39012124697](https://github.com/AndrewCraswell/ecommerce/actions/runs/39012124697), after a file-deletion failure.
