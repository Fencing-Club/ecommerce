# Shared preview assets

This Worker serves public fixture-only Storybook files from the private Copacker staging bucket.
It serves only `/pr-<number>/storybook/`; application documents are never exposed by this route.
The app preview remains on its own origin for authentication and route isolation.

See [Neon and preview operations](../../docs/neon.md) for publication, deployment and cleanup.
The parent app's type-check and verification commands include this Worker and its runtime tests.
