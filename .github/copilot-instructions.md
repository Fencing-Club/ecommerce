# Ecommerce Monorepo — Project Guidelines

A Turborepo + pnpm monorepo with React 19 and TypeScript applications. UI systems are selected at the app or
product-surface boundary. Shared config lives in `@repo/*` packages under `packages/`. See [README.md](../README.md) for
setup and the [docs index](../docs/README.md) for conventions.

## Tooling (differs from common defaults)

- **Lint:** `oxlint` (not eslint) · **Format:** `oxfmt` (not prettier).
- **Type-check:** `tsc` from the pinned TypeScript 7 native compiler — keep the version aligned across packages.
- **Test:** Vitest · **Web framework:** TanStack Start · **Workshop:** Storybook.
- **Package manager:** pnpm (`>=12`) on Node `>=24`, enforced via root `engines` + `engine-strict`.
- **Task runner:** Turborepo.
- oxlint rules live in the shared `@repo/oxlint-config` base; add new rules there so every package benefits.
- Hosted on **GitHub** — use GitHub for PRs and issues.

## Build / verify loop

Complete the whole coherent deliverable before running unit tests, type-checks, lint, browser acceptance or the full
verification suite; don't run them after each small edit. Then run the smallest relevant focused checks, repair related
failures in one batch, and finish with `pnpm verify`, which must be clean. It runs, in order, `check:format` (oxfmt),
`check:lint` and `check:types` (per package via Turbo), `check:unused` (`knip` over the whole graph) and
`test:coverage`. Formatting is global; lint and type-check are per-package.

Git hooks (lefthook): **pre-commit** runs `oxlint --fix` + `oxfmt` on staged files; **pre-push** runs
`pnpm check:types`. The pre-commit tools run via `node node_modules/...`, not `pnpm`, so lefthook can split any number
of staged files into command lines Windows accepts; keep it that way. Do not bypass them with `--no-verify` unless the
user explicitly authorizes it for a failure wholly caused by unrelated project work. That exception does not waive
focused verification for the files being committed, and the commit handoff must record the unrelated blocker and the
checks run directly.

## Workspace layout

- `apps/` — product applications; `packages/` — shared libraries, themes and templates. Each keeps its own `docs/`.
- **Reusable shared config** (extend these; don't redefine per package): `@repo/oxlint-config`,
  `@repo/typescript-config`.

## Conventions

Coding conventions live in the [`docs/`](../docs/README.md) folder — start at the index and read the relevant page
before writing code. Working in an app or package, read its own `docs/README.md` too. Two points worth stating up front:
the **React Compiler is on** (don't hand-write `useMemo`/`useCallback`/`memo`), and **reuse before building** — check
the [hooks](../docs/hooks.md) and [type-helper](../docs/typescript.md) catalogs before writing your own.

Prefer the tools in the [preferred tech stack](../docs/tech-stack.md); **introducing a library that isn't already used
needs a human discussion**, not a silent add.

- **Correctness over expediency.** Fix root causes and keep contracts coherent, even when a shortcut is faster.
- **No backward compatibility by default.** Replace obsolete contracts and implementations directly. If a change would
  break something that might need to keep working, ask first; with no one to ask, assume it doesn't.
- **One canonical implementation.** No version-suffixed files, symbols, schemas, routes or APIs (`V2`, `Phase2`,
  `legacy`) and no compatibility aliases. Fix forward instead of adding shims, fallbacks or dual paths for unreleased
  behavior.

## Documentation

- **Keep this file brief** — it's the entry point; link to `docs/` articles rather than duplicating detail.
- **Docs live with what they describe.** The root [`docs/`](../docs/README.md) is only for engineering across the whole
  monorepo (setup, TypeScript, hooks, the preferred stack). Everything specific to one app or package — its product
  rules, pages, APIs, operations, tests and specs — goes in that app or package's own `docs/` folder, indexed by its
  `docs/README.md` (for example [Copacker's](../apps/copacker/docs/README.md)). A new app or package gets a `docs/`
  folder with its first doc, and a link from the root index.
- **One topic per page, kept short**, and updated (with its folder's `README.md` index) in the same change as the
  behavior, tooling or convention it describes.
- Don't write tests or validators for prose docs, backlogs or status tables; review them directly. Tests cover code and
  generated artifacts that affect runtime behavior or an external interface.

## Product copy and UX acceptance

- Review every new or changed customer-facing string for clarity, brevity, and consistency with the surrounding UI.
- Never use a dot glyph, including `·` or `•`, as a visual separator. Use layout, separate text elements, or a clearly
  worded phrase instead.
- Verify every new or changed UX feature in the integrated browser before considering it complete. Exercise the customer
  workflow, inspect the rendered result at desktop and mobile sizes, and check keyboard and accessible-name behavior.
  Unit or component tests do not replace this browser acceptance check.

## Copacker

- Local servers use [Portless](../apps/copacker/docs/development.md). Discover worktree URLs with
  `pnpm --filter copacker dev:urls`; never kill another checkout's server, replace its route with `--force`, or stop the
  shared proxy. Update the [domain/provider inventory](../apps/copacker/docs/domains.md) for integration changes.

- Every page and component has stories with `play` tests beside its source (`<name>.stories.tsx`); add or update them
  with the change. See [apps/copacker/docs/storybook.md](../apps/copacker/docs/storybook.md).
- Production data must survive every release. Keep applied migrations immutable and append forward migrations; never
  replace deployed migration history with a fresh baseline or reset a database as part of a release. Remove obsolete
  runtime compatibility paths only when stored data meets the current contract. For schema changes, edit
  `apps/copacker/src/db/schema.ts` and run `pnpm --filter copacker db:generate`. Record deployed migration hashes in
  `apps/copacker/tests/migrations.test.ts`. See
  [database setup](../apps/copacker/docs/operations.md#databases-and-migrations). Database resets require explicit
  authorization.
- Develop against the local Docker database (`pnpm --filter copacker db:up`), never production. Local prototype data is
  disposable; never reset or delete production data unless the user explicitly asks, and keep integration credentials
  and unrelated external configuration when resetting application data unless a full reset is requested.
