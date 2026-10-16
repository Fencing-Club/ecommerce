# Local development with Portless

Use Node 24+ and the repository's pinned Portless version. Copy `.env.example` to `.env` and fill in development
credentials. See [domains and provider configuration](domains.md) for every environment address and external setting.

```sh
pnpm --filter copacker dev:setup
pnpm --filter copacker dev:urls
pnpm dev
pnpm --filter copacker storybook
pnpm --filter copacker worker:dev
pnpm --filter copacker dev:status
```

Run setup once interactively on each workstation: it starts the shared HTTPS proxy on 443 with suffix
`copacker.ai`. The explicit app name is `local` in the primary checkout. Portless may request administrator access to trust its CA. Public DNS-only `local.copacker.ai` and `*.local.copacker.ai` must resolve to `127.0.0.1`; launchers disable per-route hosts-file edits. Networks that block loopback DNS answers need administrator-managed hosts entries instead. Do not
disable certificate validation. If setup reports an incompatible existing proxy, coordinate with its owner before
changing it; never stop another agent's proxy to reclaim a port. `pnpm --filter copacker exec portless doctor` checks
the proxy and certificate setup. On Windows, the launcher uses Git for Windows' bundled OpenSSL if it is absent from PATH. The launcher refuses an unexpected proxy origin instead of silently using it.

The primary checkout uses `local.copacker.ai`, `stories.local.copacker.ai`, and (when running a dedicated test server)
`e2e.local.copacker.ai`. Linked checkouts use the normalized worktree folder name: `<worktree>.local.copacker.ai`,
`<worktree>.stories.local.copacker.ai`, and `<worktree>.e2e.local.copacker.ai`. There is no path hash and no special `main`
branch convention. Switching branches or moving a folder without renaming it leaves its URL unchanged.

Worktree folder names normalize to lowercase DNS labels. Use at most 63 characters; `stories`, `e2e`, and `hooks` are
reserved service names. If another server already owns an address, startup reports the domain and port without replacing
it. Rename the worktree to resolve a collision. Portless also rejects simultaneous claims made after the initial check.
Ports are allocated by Portless; Storybook receives its assigned port explicitly and refuses port fallback.

The full [primary/worktree mapping and activation checklist](domains.md#local-addresses) includes auth paths and optional
webhook tunnels. Changing the shared proxy suffix requires coordinating a restart with every active owner; run
`dev:setup` only once that transition is agreed. Do not stop another checkout's server or silently change its routes.

Each app process overrides `.env`'s `APP_URL`, aliases and WorkOS callback with its exact origin. Workers started with
`worker:dev` use the same origin for emailed links. The deployment `worker` command remains independent of Git and
Portless. Host-only cookies keep worktree sessions separate. Keep the existing exact-origin security checks.

## Ownership

- One app and one Storybook server per checkout. A duplicate route must fail; never use Portless `--force`.
- Stop a server with Ctrl+C in the terminal that started it. Portless owns its child process tree and route cleanup.
- `dev:status` prints this checkout's URLs and active Portless routes. Reuse only the exact checkout/service URL.
- Never use global process-name kills, `portless clean`, `proxy stop` or `prune` to resolve a single task's conflict.
- Put worktrees under `D:\system\worktrees\ecommerce\<worktree-name>` and remove owned worktrees after completion.
- Separate mutable databases, test accounts, S3 prefixes and live provider resources when concurrent work changes
  them. Portless isolates addresses, not data. The default Docker database remains shared unless explicitly separated.
- Do not copy staging/production queue URLs into local `.env`. Local HTTPS does not make a webhook publicly reachable.

## Amazon Ads authorization

Use the [shared staging callback](amazon-ads.md#shared-development-callback) for live Amazon Ads development. Each
worktree keeps its own app origin and session; its signed state tells the relay where to return. Do not register
localhost ports or rewrite the worktree's `APP_URL` to the shared callback origin. Configure the relay on staging
before enabling its variables locally. Storybook previews use mocks and never receive relay or provider secrets.

## E2E

Copacker currently chooses a dedicated E2E process so tests can build and stop independently of interactive development.
A second domain is a convenience, not a Playwright requirement; testing an existing app URL needs no additional hostname.

Local Playwright owns a dedicated `<worktree>.e2e.local.copacker.ai` server and never reuses an existing server. Build it
with `pnpm --filter copacker build:e2e`, then run `pnpm --filter copacker test:e2e`. `E2E_DEV=1` uses Vite development
mode. The built preview uses `e2e/runtime/.cloudflare/output/v0`; its R2 emulator uses `.cloudflare/state/e2e`.
Interactive development uses `.cloudflare/state/development`, and release builds use `.cloudflare/output/v0`.
Run only one E2E suite per checkout. The test launcher enables Node system CA trust for HTTPS health and API requests.
`E2E_BASE_URL` explicitly targets an existing local or deployed server. CI uses isolated loopback port 3005 and the same
E2E build. Database isolation remains the caller's responsibility.

`worker:dev` uses the development app's local S3 endpoint to access the same R2 bucket as the web app. One Cloudflare
emulator owns the storage, avoiding concurrent SQLite writers. Local credentials are generated in ignored
`.cloudflare/storage-credentials.json`; they are never used in deployed environments.
The deployed Node worker still uses S3 credentials pointing to the environment's private R2 bucket. See the
[runtime and release guide](cloudflare.md) for bindings, migrations and storage recovery.

## Acceptance

Before rolling out a Portless upgrade, run app and Storybook in two worktrees, check HTTPS, HMR and Storybook's iframe
and mock worker in the integrated browser, and verify login/logout returns to each originating host. Confirm duplicate
starts fail and stopping one server leaves the others running. Test E2E without reusing the interactive server. Run
`pnpm verify` before committing implementation changes. External console changes are tracked in the domain inventory.
