# Ecommerce

A pnpm and Turborepo workspace for commerce software, using the shared tooling conventions from Agency.

## Applications and packages

- `apps/copacker`: Next.js supplier/buyer portal, WorkOS authentication, Drizzle/Postgres, private Railway documents.
- `apps/video`: the Copacker ad, made with Remotion ([video](apps/video/docs/README.md)).
- `packages/aisle`: reusable shipment, catalog, packing validation, and label/document logic adapted from Aisle.
- `packages/copacker-emails`: Copacker's transactional emails, built with React Email; `pnpm dev` there previews them.
- `packages/fc-templates`: Fencing Club email and print templates.
- `packages/fc-theme` and `packages/fc-theme-base`: Shopify themes.
- `packages/shopify-emails` and `packages/shopify-content`: the supporting Shopify toolkits.
- `packages/typescript-config` and `packages/oxlint-config`: shared engineering configuration.

Use Node 24+ and pnpm 11. Run `pnpm install`, `pnpm dev`, and `pnpm verify` from this directory. `pnpm build` builds all
applicable packages. [Setup](docs/setup.md) covers the registry; Copacker's releases and credentials are in
[its operations guide](apps/copacker/docs/operations.md).

The monorepo's engineering docs are indexed in [docs](docs/README.md). Each app and package keeps the docs specific to
it in its own `docs/` folder, such as [Copacker's](apps/copacker/docs/README.md).
