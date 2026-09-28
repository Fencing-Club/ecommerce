# Ecommerce

A pnpm and Turborepo workspace for commerce software, using the shared tooling conventions from Agency.

## Applications and packages

- `apps/copacker`: Next.js supplier/buyer portal, WorkOS authentication, Drizzle/Postgres, private Railway documents.
- `apps/video`: the Copacker ad, made with Remotion ([video](docs/video.md)).
- `packages/aisle`: reusable shipment, catalog, packing validation, and label/document logic adapted from Aisle.
- `packages/copacker-emails`: Copacker's transactional emails, built with React Email; `pnpm dev` there previews them.
- `packages/fc-templates`: Fencing Club email and print templates.
- `packages/fc-theme` and `packages/fc-theme-base`: Shopify themes.
- `packages/shopify-emails` and `packages/shopify-content`: the supporting Shopify toolkits.
- `packages/typescript-config` and `packages/oxlint-config`: shared engineering configuration.

Use Node 24+ and pnpm 11. Run `pnpm install`, `pnpm dev`, and `pnpm verify` from this directory. `pnpm build` builds all
applicable packages. Setup, releases and credentials are in [the operations guide](docs/operations.md).

The rest of the documentation is indexed in [docs](docs/README.md).
