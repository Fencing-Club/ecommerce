# Ecommerce Monorepo — Project Guidelines

A Turborepo + pnpm monorepo with React 19 and TypeScript applications. UI systems are selected at the app or
product-surface boundary. Shared config lives in `@repo/*` packages under `packages/`. See [README.md](../README.md) for
setup and the [docs index](../docs/README.md) for conventions.

## Tooling (differs from common defaults)

- **Lint:** `oxlint` (not eslint) · **Format:** `oxfmt` (not prettier).
- **Type-check:** `tsc` from a pinned native TypeScript — keep the version aligned across packages.
- **Test:** Vitest · **Web framework:** Next.js · **Workshop:** Storybook.
- **Package manager:** pnpm (`>=11`) on Node `>=24`, enforced via root `engines` + `engine-strict`.
- **Task runner:** Turborepo.

## Build / verify loop

Complete the coherent implementation before running unit tests, type-checks, lint, browser acceptance, or the full
verification suite. Do not run these checks after each small edit. Once the implementation is complete, run the smallest
relevant focused checks, then run the required final verification. If a check exposes related defects, batch the repairs
before rerunning that check.

Run `pnpm verify` before declaring work done — it must be clean. It runs `check` (oxfmt format + `oxlint` lint and `tsc`
type-check deferred per-package via Turbo + `knip` once over the whole graph) then `test:coverage`. Formatting is
global; lint and type-check are per-package; knip is root-only.

Git hooks (lefthook): **pre-commit** runs `oxlint --fix` + `oxfmt` on staged files; **pre-push** runs
`pnpm check:types`. Do not bypass them with `--no-verify` unless the user explicitly authorizes it for a failure wholly
caused by unrelated project work. That exception does not waive focused verification for the files being committed, and
the commit handoff must record the unrelated blocker and the checks run directly.

## Workspace layout

- `apps/` — product applications.
- **Reusable shared config** (extend these; don't redefine per package): `@repo/oxlint-config`,
  `@repo/typescript-config`.

## Conventions

Coding conventions live in the [`docs/`](../docs/README.md) folder — start at the index and read the relevant page
before writing code. Two points worth stating up front: the **React Compiler is on** (don't hand-write
`useMemo`/`useCallback`/`memo`), and **reuse before building** — check the [hooks](../docs/hooks.md) and
[type-helper](../docs/typescript.md) catalogs before writing your own.

Prefer the tools in the [preferred tech stack](../docs/tech-stack.md); **introducing a library that isn't already used
needs a human discussion**, not a silent add.

## Documentation

- **Keep this file brief** — it's the entry point; link to `docs/` articles rather than duplicating detail.
- **Prefer small, focused `docs/` pages**, and update them (and the [index](../docs/README.md)) in the same change as
  the behavior they describe.
- Do not create executable validators or test suites for prose documentation, evidence ledgers, backlog/status tables,
  or narrative part-selection records. Review those artifacts directly. Tests should cover executable code and generated
  product artifacts whose correctness affects runtime behavior, fabrication, or an external interface.

## Product copy and UX acceptance

- Review every new or changed customer-facing string with the Fluent Agent MCP when it is available. Use the Microsoft
  Content Style Guide knowledge base for wording and the relevant Fluent design knowledge base for the interaction.
  Apply the guidance before considering the copy complete. If the MCP is unavailable, state that in the final result and
  do not claim that the copy was Fluent-validated.
- Never use a dot glyph, including `·` or `•`, as a visual separator. Use layout, separate text elements, or a clearly
  worded phrase instead.
- Verify every new or changed UX feature in the integrated browser before considering it complete. Exercise the customer
  workflow, inspect the rendered result at desktop and mobile sizes, and check keyboard and accessible-name behavior.
  Unit or component tests do not replace this browser acceptance check.

## Gotchas

- Hosted on **GitHub** — use GitHub for PRs and issues.
- oxlint rules live in the shared `@repo/oxlint-config` base; add new rules there so every package benefits.

## Principles for development

- **Don't reinvent wheels.** [typescript.md](../docs/typescript.md) and [hooks.md](../docs/hooks.md) catalog what the
  installed libraries already provide. Check them before adding a hook or type helper.
- **One topic per page, kept short.** Prefer a new focused page over growing an existing one past a scannable length.
- **Docs stay current.** When behavior, tooling, or conventions change, update the relevant page (and this index) in the
  same change.
- Don't overtest or verify. Complete shippable units of work before running test passes and resolving failures. Test
  passes cost lots of time.
- Prefer correctness over expediency or backwards compatibility. If faced with an issue where the new behavior would
  create a breaking change, ask first whether it needs to be backwards compatible. If no user is available to answer,
  assume not.
- Do not preserve backward compatibility. Replace obsolete contracts and implementations directly.
- Do not create version-suffixed files, symbols, schemas, routes, or APIs such as `V2`, `Phase2`, `legacy`, or
  compatibility aliases. Keep one canonical implementation.
- Fix forward. Update the current implementation instead of adding shims, fallbacks, or dual paths for unreleased
  behavior.
- Copacker's database holds production data. Change its schema only through a new migration: edit
  `apps/copacker/src/db/schema.ts`, run `pnpm --filter copacker db:generate`, and add the new file's hash to
  `apps/copacker/tests/migrations.test.ts` once it has been deployed. Never edit an existing migration or apply SQL by
  hand. Deploys run pending migrations (the web service's `predeploy` script) before the web service starts.
- Develop against the local Docker database (`pnpm --filter copacker db:up`), never the production database.
- Prioritize correctness over expediency. Fix root causes and maintain coherent contracts even when resetting prototype
  state is faster than preserving it.
- Treat local prototype data as disposable. Never reset or delete production data unless the user explicitly asks.
- Preserve integration credentials and unrelated external configuration when resetting application data unless the user
  explicitly requests a full reset.
- Complete the entire coherent deliverable before running tests, type-checks, lint, formatting checks, browser
  acceptance, or repository verification.
- After the deliverable is complete, run the smallest relevant focused checks, repair related failures in one batch, and
  then run the required final repository verification.
- Do not run verification after each incremental edit or partial implementation.
