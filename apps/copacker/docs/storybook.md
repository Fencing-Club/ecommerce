# Storybook

Local Storybook runs at `<worktree>.stories.local.copacker.ai` through [Portless](development.md).
Deployed static builds use `stories.staging.copacker.ai` and `stories.copacker.ai`; see the
[environment domain inventory](domains.md) for DNS, TLS and release configuration.

## Hosting

The Cloudflare release builds an assets-only Worker with `scripts/build-stories-release.ts`. It serves static
Storybook and reports the release commit at `/health.json`. No database, WorkOS or other application bindings are
attached. Stories use fixtures and MSW; do not put private data into them. Responses include `noindex, nofollow`.

The existing Railway Storybook services remain live until the separate domain cutover. See the
[release guide](cloudflare.md) for build validation, environment variables and health checks, and the
[domain inventory](domains.md) for the last verified live DNS configuration.

## Stories and tests

Copacker's pages and components live in Storybook 10 (`@storybook/react-vite`), each story beside its source:
`src/app/**/page.stories.tsx` for pages and `src/components/**/<name>.stories.tsx` for components. Every story has a
`play` function, and Vitest runs them all in Chromium.

The preview records ordinary internal anchor clicks through the navigation mock without leaving the story iframe.
Route-controlled filters, refreshes and search navigation receive explicit callbacks in their component stories.
The integrated browser remains required for actual document navigation, Start transitions and cross-tab behavior.

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

- **Pages** receive explicit rendering data from server functions. Page stories provide typed fixtures to the same
  components. `pageStory(pathname, render, kind)` from `@/stories/server` shows them in the real portal shell. Cover each
  workspace kind, empty state and permission branch; title them `Pages/<Sidebar name>/...`.
- **Server data** can be prepared through `serverStory(render)`, which resolves asynchronous fixtures in a loader.
  The localization context answers from the toolbar language. The `@/db` mock supplies each table from
  `parameters: { db: { contacts: [...] } }`.

- **API calls** go through Mock Service Worker. `.storybook/mocks/handlers.ts` has the defaults (changes succeed, lists
  are empty); a story overrides them in `beforeEach({ msw })` with `msw.use(http.get(...))`.
- **Permissions**: stories run as the workspace owner. Set `parameters: { permissions: member }` (from
  `@/stories/workspace`) to see what a member sees.
- **Fixtures** live in `src/stories/fixtures/<area>.ts`, typed with the app's own types.
- **Navigation**: `.storybook/router.tsx` creates a real TanStack memory router per story. Set
  `parameters: { router: { navigation: { pathname, query } } }` for components that read the URL.
  `getStoryRouter()` exposes recorded navigate/invalidate calls for assertions.
