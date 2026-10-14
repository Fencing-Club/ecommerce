# Storybook

Local Storybook runs at `<worktree>.stories.local.copacker.ai` through [Portless](development.md).
Deployed static builds use `stories.staging.copacker.ai` and `stories.copacker.ai`; see the
[environment domain inventory](domains.md) for DNS, TLS and release configuration.

## Hosting

Each Railway environment has a `copacker-stories` service built with the root `Dockerfile.storybook`, listening on
8080 with `/health` as its healthcheck and `/health.json` for release metadata. It builds Storybook, then serves only the static output with unprivileged
nginx. Do not supply database, WorkOS, Google Maps or other application credentials to this service. Stories use
fixtures and MSW. The site is public documentation with `noindex, nofollow`; do not put private data into fixtures.

Set Railway's Dockerfile path to `Dockerfile.storybook` and `APP_COMMIT_SHA` to the release SHA before building. The
shared deployment script deploys web, worker and Storybook, then checks both health endpoints for the expected SHA.
Production promotion deploys the commit staging serves, including its Storybook. No database migration runs on the
Storybook service. Use DNS-only CNAMEs to Railway for these domains so Railway's own certificate covers the nested
`stories.staging.copacker.ai` hostname. Provision services and domains before merging the workflow change.

## PR previews

A separate Railway project hosts fixture-only PR previews. Railway posts the generated HTTPS preview URL on the PR,
updates it on pushes and removes the environment when the PR closes. See the [preview inventory](domains.md#pull-request-previews).
Page stories provide the UX preview using fixtures and mocked APIs. These environments do not inherit application credentials or data. Database previews are deferred until Neon and storage previews until Cloudflare; see the [deferred persistence decision](domains.md#deferred-persistence-decision-2026-10-14). Main's CI still validates the static build and
runs the story tests before staging release deployment.

## Stories and tests

Copacker's pages and components live in Storybook 10 (`@storybook/nextjs-vite`), each story beside its source:
`src/app/**/page.stories.tsx` for pages and `src/components/**/<name>.stories.tsx` for components. Every story has a
`play` function, and Vitest runs them all in Chromium.

```bash
pnpm --filter copacker storybook
```

```bash
pnpm --filter copacker exec vitest run --project storybook
```

`tests/stories.test.ts` fails when a page or component has no stories. Components with nothing to show (providers,
contexts, effects that render nothing) are listed there instead.

## The toolbar

- **Theme**: light or dark. It sets the `dark` class and the choice the app's ThemeProvider reads.
- **Language**: every locale in `src/i18n/locales.ts`, with Urdu right to left. Messages load with the app's own
  `loadMessages`, so a missing translation falls back to English as in the app.
- **Viewport**: Storybook's device sizes.

## Writing stories

Stories use CSF Next: import the preview and build the meta and stories from it.

```tsx
import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { StatCard } from "./stat-card"

const meta = preview.meta({ component: StatCard, args: { label: "Open purchase orders", value: 12 } })

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Open purchase orders")).toBeVisible()
  }
})
```

- **Pages** are server components that read the database, so a page's story recreates its server render: an async
  function beside the stories that renders what `page.tsx` renders, from fixture data instead of queries. Pass it to
  `pageStory(pathname, render, kind)` from `@/stories/server`, which shows it inside the real portal shell (header and
  sidebar) at that path. Title page stories `Pages/<Sidebar name>/...`. Cover each branch the page has: each workspace
  kind that sees it, empty states, a member without access.
- **Async server components** (such as `OrderList` or `PoTimeline`) render through `serverStory(render)`, which
  resolves them in a loader before the story shows. `next-intl/server` answers from the toolbar's language, and `@/db`
  answers each table's query with the story's `db` parameter: `parameters: { db: { contacts: [...] } }`.
- **API calls** go through Mock Service Worker. `.storybook/mocks/handlers.ts` has the defaults (changes succeed, lists
  are empty); a story overrides them in `beforeEach({ msw })` with `msw.use(http.get(...))`.
- **Permissions**: stories run as the workspace owner. Set `parameters: { permissions: member }` (from
  `@/stories/workspace`) to see what a member sees.
- **Fixtures** live in `src/stories/fixtures/<area>.ts`, typed with the app's own types.
- **Navigation**: `next/navigation` and `next/link` are Storybook's mocks. Set
  `parameters: { nextjs: { navigation: { pathname, query } } }` for components that read the URL.
