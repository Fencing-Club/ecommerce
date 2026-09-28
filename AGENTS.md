# AGENTS.md

Agent guidance for this repository lives in [.github/copilot-instructions.md](.github/copilot-instructions.md). Read it
before making changes.

Quick reference:

- **Lint:** `oxlint` (not eslint) · **Format:** `oxfmt` (not prettier)
- **Type-check:** TypeScript 7 RC native compiler via `pnpm check:types`
- **Test:** Vitest via `pnpm test` · **Build:** Next.js / package builds via `pnpm build`
- **Package manager:** pnpm `>=11` on Node `>=24` · **Tasks:** Turborepo
- **Git hooks:** lefthook (pre-commit: `oxlint --fix` + `oxfmt`; pre-push: `check:types`). Don't use `--no-verify`.
- **Styling:** shadcn/ui components with Tailwind v4 (`pnpm dlx shadcn@latest add` from `apps/copacker`); existing
  vanilla-extract page styles stay. See [docs/styling.md](docs/styling.md).
- **Reuse first:** prefer `@mantine/hooks`, `ts-extras`, `ts-pattern`, and `tiny-invariant` over hand-rolled hooks /
  type helpers; narrow with type guards, not `as`.
- **Product copy:** validate every customer-facing string with Fluent Agent MCP when available. Never use `·`, `•`, or
  another dot glyph as a visual separator.
- **Storybook:** every page and component has sibling `*.stories.tsx` with `play` tests
  (`pnpm --filter copacker storybook`); `tests/stories.test.ts` fails on a missing one. See
  [docs/storybook.md](docs/storybook.md).
- **UX acceptance:** verify every UX change through the integrated browser before calling it complete. Component tests
  alone are not sufficient.

Verify loop (must be clean before finishing): run **`pnpm verify`** (format, lint, types, knip, tests with coverage).
