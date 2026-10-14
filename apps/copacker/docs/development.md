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
`local.copacker.ai`. Portless may request administrator access to trust its CA. Public DNS-only `*.local.copacker.ai` resolves to `127.0.0.1`; launchers disable per-route hosts-file edits. Networks that block loopback DNS answers need administrator-managed hosts entries instead. Do not
disable certificate validation. If setup reports an incompatible existing proxy, coordinate with its owner before
changing it; never stop another agent's proxy to reclaim a port. `pnpm --filter copacker exec portless doctor` checks
the proxy and certificate setup. On Windows, the launcher uses Git for Windows' bundled OpenSSL if it is absent from PATH. The launcher refuses an unexpected proxy origin instead of silently using it.

The primary checkout is `main.local.copacker.ai`. Linked worktrees use their directory slug and path hash. Storybook and
E2E add `.stories` and `.e2e` before `local.copacker.ai`. Explicit Portless names avoid an additional branch/app label.
Ports are allocated by Portless; Storybook receives its assigned port explicitly and refuses port fallback.

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

## E2E

Local Playwright owns a dedicated `<worktree>.e2e.local.copacker.ai` server and never reuses an existing server. Build it
with `pnpm --filter copacker build:e2e`, then run `pnpm --filter copacker test:e2e`. `E2E_DEV=1` runs Next development
mode instead. Both use `.next-e2e`, leaving the interactive `.next` directory alone. Run only one E2E suite per checkout. The test launcher enables Node system CA trust for HTTPS health and API requests.
`E2E_BASE_URL` remains reserved for an explicitly deployed target. CI keeps its isolated loopback port and normal build.

## Acceptance

Before rolling out a Portless upgrade, run app and Storybook in two worktrees, check HTTPS, HMR and Storybook's iframe
and mock worker in the integrated browser, and verify login/logout returns to each originating host. Confirm duplicate
starts fail and stopping one server leaves the others running. Test E2E without reusing the interactive server. Run
`pnpm verify` before committing implementation changes. External console changes are tracked in the domain inventory.
