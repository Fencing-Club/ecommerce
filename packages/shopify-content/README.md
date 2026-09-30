# Shopify Content Installer

Reusable, dependency-ordered Shopify content provisioning through the authenticated Shopify CLI.

Content commands: `validate`, `pack`, `plan`, and `apply`. The default is to create missing resources and keep existing
content. Writes require an explicit destination and matching confirmation. Content replacement is opt-in per resource
key.

See [the installation guide](../fc-theme-base/docs/shopify-content-installation.md) for the manifest contract,
authentication, supported resources, failure handling, and the Fencing Club starter pack.

Catalog commands copy the Fencing Club catalog into the Contoso development store; see
[the catalog rehearsal](../fc-theme-base/docs/shopify-catalog-rehearsal.md):

- `snapshot-catalog` reads a source store’s products into a new local file, without customers, orders, credentials, or
  stock quantities.
- `import-catalog` creates missing draft products from a snapshot and keeps existing ones.
- `finalize-catalog` verifies the imported drafts, restores bundles and sizing, then activates the catalog.

`configure-theme` attaches installed menus and ordered sizing groups to an unpublished theme without replacing unrelated
settings. It writes a backup first, and plans without writing unless `--confirm-store` repeats the destination.

This package does not deploy or publish themes. Its source CLI runs under Node 24+ with the workspace's `tsx` runner.
