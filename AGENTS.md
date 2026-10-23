# AGENTS.md

Agent guidance for this repository lives in [.github/copilot-instructions.md](.github/copilot-instructions.md). Read it
before making changes.

Quick reference:

- **Lint:** `oxlint` (not eslint) · **Format:** `oxfmt` (not prettier)
- **Type-check:** TypeScript 7 RC native compiler via `pnpm check:types`
- **Test:** Vitest via `pnpm test`; Playwright end-to-end via `pnpm --filter copacker test:e2e`
  ([apps/copacker/docs/e2e.md](apps/copacker/docs/e2e.md)) · **Build:** TanStack Start / package builds via `pnpm build`
- **Never test migrations:** no test runs, replays or checks them. Database tests build the schema from
  `src/db/schema.ts` with `applySchema` (`apps/copacker/tests/database.ts`). Only CI's one `db:migrate` release gate
  runs them.
- **Package manager:** pnpm `>=12` on Node `>=24` · **Tasks:** Turborepo
- **Git hooks:** lefthook (pre-commit: `oxlint --fix` + `oxfmt`; pre-push: `check:types`). Don't use `--no-verify`.
- **Styling:** shadcn/ui components from buildkit's Vega kit (`@buildkitgg/shadcn-baseui-kit`), used as they are, with
  Tailwind v4; no local copies of shadcn's source. Existing vanilla-extract page styles stay. See
  [apps/copacker/docs/styling.md](apps/copacker/docs/styling.md).
- **Reuse first:** prefer `@mantine/hooks`, `ts-extras`, `ts-pattern`, and `tiny-invariant` over hand-rolled hooks /
  type helpers; narrow with type guards, not `as`.
- **Product copy:** use clear, concise wording. Never use `·`, `•`, or another dot glyph as a visual separator.
- **Storybook:** every page and component has sibling `*.stories.tsx` with `play` tests
  (`pnpm --filter copacker storybook`); `tests/stories.test.ts` fails on a missing one. See
  [apps/copacker/docs/storybook.md](apps/copacker/docs/storybook.md).
- **Docs:** root [`docs/`](docs/README.md) is for monorepo-wide engineering only. Anything specific to one app or
  package goes in that app or package's own `docs/` folder, indexed by its `docs/README.md`; every app and package gets
  one.
- **UX acceptance:** verify every UX change through the integrated browser before calling it complete. Component tests
  alone are not sufficient.

Verify loop (must be clean before finishing): run **`pnpm verify`** (format, lint, types, knip, and the unit tests the
change reaches). Stories, e2e and coverage run in PR validation; `pnpm verify:ci` runs every test with coverage.
