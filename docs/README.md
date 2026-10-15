# Ecommerce engineering

How the monorepo is built: the conventions and tools every app and package shares.

- [Setup: Node, pnpm and checks](setup.md)
- [TypeScript conventions](typescript.md)
- [React hooks](hooks.md)
- [Preferred stack](tech-stack.md)

## Where docs live

This folder is for engineering across the whole monorepo. Everything about one app or package lives in that app or
package's own `docs/` folder, next to its code: its product rules, pages, APIs, operations, tests and specs. Start at its
`docs/README.md`, or its `README.md` where the package has no index.

- [Copacker](../apps/copacker/docs/README.md)
- [Video: the Copacker ad in Remotion](../apps/video/docs/README.md)
- [Turbo remote cache on Cloudflare](../apps/turbo-cache/docs/README.md)
- [Fencing Club email and print templates](../packages/fc-templates/README.md)
- [Fencing Club Shopify theme](../packages/fc-theme/README.md), and its [base theme's docs](../packages/fc-theme-base/docs/)
- [Shopify emails](../packages/shopify-emails/README.md)
