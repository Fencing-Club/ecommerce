# Lint, format and Git hooks

[Vite+](https://viteplus.dev) (`vp`) lints with Oxlint, formats with Oxfmt and runs the Git hooks. Turborepo still runs
the tasks.

## Config

The root [`vite.config.ts`](../vite.config.ts) holds the lint, format and staged-file settings for the whole monorepo.
Vite+ ignores nested lint and format configs, so a package-specific setting goes in the root config as an ignore pattern
or an override. The lint rules live in [`@repo/oxlint-config`](../packages/oxlint-config/base.json), which the root
config spreads into its `lint` block.

- Each package's `lint` script runs `vp lint --max-warnings=0`; `pnpm check:lint` runs them through Turbo.
- `pnpm check:format` runs `vp fmt --check`. `pnpm exec vp fmt <files>` formats files.

## Hooks

`pnpm install` runs `vp config --no-agent`, which installs the hook dispatcher in `.vite-hooks/_` and points Git's
`core.hooksPath` at it. The hook scripts are `.vite-hooks/pre-commit` and `.vite-hooks/pre-push`.

- **pre-commit** runs `vp staged`, which takes its rules from the `staged` block in `vite.config.ts`. It runs
  `vp check --fix` on staged code, JSON, CSS, YAML and Markdown files and stages the fixes. When `.liquid` or `.json`
  files under `packages/fc-theme-base/` are staged, it also runs that package's Theme Check.
- **pre-push** runs `pnpm check:types`.

The staged check runs `vp` through `node`, not the `vp.cmd` shim, so large commits fit a Windows command line.

Don't skip the hooks with `--no-verify` without the user's permission. Docker builds set `VP_GIT_HOOKS=0`, which turns
the hooks off.

`core.hooksPath` is shared by every worktree of a clone. A worktree whose branch predates Vite+ has no `.vite-hooks/_`,
so its commits run no hooks until it's rebased onto `main` and installed.
