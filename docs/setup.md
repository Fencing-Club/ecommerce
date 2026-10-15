# Setup

Node 24+ and pnpm 12 are required. Install at the root with `pnpm install`, then follow [Copacker Portless setup](../apps/copacker/docs/development.md) before `pnpm dev`. Local installs, CI and
Docker builds use the public npm registry.

`pnpm verify` runs the checks CI runs: formatting, lint, types, unused code (knip) and every package's tests with
coverage. Each app's own setup, such as its environment file and database, is in its `docs/` folder: Copacker's is
[Run Copacker](../apps/copacker/docs/operations.md).
