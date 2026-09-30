# Setup

Node 24+ and pnpm 11 are required. Install at the root with `pnpm install`, then `pnpm dev`. The checked-in `.npmrc`
points at the corporate registry (`pnpm auth` signs in to it); outside that network set
`PNPM_CONFIG_REGISTRY=https://registry.npmjs.org/` for install. CI and the Docker builds use the public registry.

`pnpm verify` runs the checks CI runs: formatting, lint, types, unused code (knip) and every package's tests with
coverage. Each app's own setup, such as its environment file and database, is in its `docs/` folder: Copacker's is
[Run Copacker](../apps/copacker/docs/operations.md).
