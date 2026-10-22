# Ecommerce

A pnpm and Turborepo workspace for commerce software, using the shared tooling conventions from Agency.

## Applications and packages

- `apps/copacker`: TanStack Start supplier/buyer portal on Cloudflare, WorkOS authentication, Drizzle/Postgres and
  private documents.
- `apps/video`: the Copacker ad, made with Remotion ([video](apps/video/docs/README.md)).
- `apps/turbo-cache`: the Turborepo remote cache the monorepos share ([turbo cache](apps/turbo-cache/docs/README.md)).
- `packages/copacker-shipments`: Copacker's purchase orders, packing, labels and shipping documents.
- `packages/copacker-marketplaces`: Copacker's Amazon, Shopify and eBay clients, sales collectors and report parsers.
- `packages/copacker-cli`, `packages/copacker-client` and `packages/copacker-contract`: the `copacker` command line, its
  API client and the shared operation contract. Not usable until the app serves the operation API.
- `packages/copacker-emails`: Copacker's transactional emails, built with React Email; `pnpm dev` there previews them.
- `packages/fc-templates`: Fencing Club email and print templates.
- `packages/fc-theme` and `packages/fc-theme-base`: Shopify themes.
- `packages/shopify-emails` and `packages/shopify-content`: the supporting Shopify toolkits.
- `packages/typescript-config` and `packages/oxlint-config`: shared engineering configuration.

Use Node 24+ and pnpm 12. Run `pnpm install`, `pnpm dev`, and `pnpm verify` from this directory. `pnpm build` builds all
applicable packages. [Setup](docs/setup.md) covers the registry; Copacker's releases and credentials are in
[its operations guide](apps/copacker/docs/operations.md).

The monorepo's engineering docs are indexed in [docs](docs/README.md). Each app and package keeps the docs specific to
it in its own `docs/` folder, such as [Copacker's](apps/copacker/docs/README.md).
