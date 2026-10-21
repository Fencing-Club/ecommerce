# Storybook

Local Storybook runs at `<worktree>.stories.local.copacker.ai` through [Portless](development.md).
Deployed static builds use `stories.staging.copacker.ai` and `stories.copacker.ai`; see the
[environment domain inventory](domains.md) for DNS, TLS and release configuration.

## Hosting

The Cloudflare release builds an assets-only Worker with `scripts/build-stories-release.ts`. It serves static
Storybook and reports the release commit at `/health.json`. No database, WorkOS or other application bindings are
attached. Stories use fixtures and MSW; do not put private data into them. Responses include `noindex, nofollow`.

Configured PR previews publish `copacker-stories-pr-<number>` on the account's workers.dev subdomain. The same
[preview lifecycle](neon.md#pr-previews) deploys and removes this Worker, including when a PR is merged.

See the
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

Stories that render a real PDF, such as the shipping document previews, the supplier packet page and the packing list
download, carry the `documents` tag: they're there to look at, and Vitest leaves them out (`tags: { exclude:
["documents"] }` in `vitest.config.ts`), so neither `pnpm verify` nor CI renders a document. Write the tag in the
story file itself, on the meta or the story; the test plugin reads tags from the source, so one spread in from a shared
object doesn't count. `tags: ["!documents"]` keeps a story under a tagged meta that renders nothing, such as one blocked
before its PDF.

`tests/stories.test.ts` fails when a page or component has no stories. Components with nothing to show (providers,
contexts, effects that render nothing) are listed there instead.

## The sidebar

Every story file sets an explicit `title` in one of five sections. `tests/stories.test.ts` checks each rule.

| Section | Holds | Title |
| --- | --- | --- |
| Foundations | The shadcn primitives in `src/components/ui` | `Foundations/<Name>` |
| Components | App components, grouped by product area | `Components/<Area>/<Name>` |
| Pages | The real routes in `src/app`, rendered with fixtures | `Pages/<Route>/<View>` |
| Prototypes | Designs built only in Storybook: in `src/stories`, or beside the route a design is for until it's built (listed in the test) | `Prototypes/<Name>` |
| Unused | Components no app code renders yet | `Unused/<Area>/<Name>` |

Component areas are App shell, Forms, Display, Purchase orders, Shipments, Booking, Products, Inventory, Sales and
costs, Integrations, Partners, Settings, Shipping documents, Supplier workspace, Auth, Onboarding and Marketing. Pages
are grouped by route, not by workspace kind: buyer and supplier views of a route are stories of the same page.

A `Pages/` story must live in `src/app` and render the route itself. Apart from fixtures and the `server`, `workspace`
and `shipping-documents` helpers, it may not import from `src/stories`, so a page story can't quietly show a copy of
the page. Every other story in `src/app` must be a `Pages/` story too, unless the test lists it as a route prototype.

`Unused` is computed, not curated. The test follows imports from every route, server module and library, and a
component's stories belong in `Unused` exactly when nothing reaches the component. Wiring a component into the app
fails the test until its stories move to `Components`, and removing its last use fails it until they move to `Unused`.
Review that section for components awaiting app work or ready to delete.

## The toolbar

- **Theme**: light or dark. It sets the `dark` class and the choice the app's ThemeProvider reads.
- **Language**: every locale in `src/i18n/locales.ts`, with Urdu right to left. Messages load with the app's own
  `loadMessages`, so a missing translation falls back to English as in the app.
- **Viewport**: Storybook's device sizes.

## Writing stories

### Purchase order and shipment lists

`LogisticsList` renders both live lists; see [Purchase order and shipment lists](logistics-lists.md). Its component
stories (`Components/Purchase orders/Logistics list`) use the fictional rows from the approved Pen frames in
`src/stories/fixtures/logistics-lists.ts`. The page stories build their rows with the server's own
`orderListRows` and `shipmentListRows`, so a change to how rows are worked out changes the stories too.

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
  workspace kind, empty state and permission branch; title them `Pages/<Route>/<View>`.
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

A play function that types needs the document focused. Vitest's browser is; a fresh load in the desktop app's browser
pane may not be, and its typing then never reaches React. Click the page before rerunning such a story there.

## Purchase order timeline

The live PO page and the interactive purchase-order flow use `PoTimeline` and `TimelineComment` from
`src/components`. Keep timeline spacing, avatars, event markers, comment bubbles, and the audience selector in those
shared components, not in page or prototype markup. The flow supplies fixture entries and updates them after the
mocked comment action succeeds. Revision-specific content uses the timeline entry's details slot.

Their sibling stories cover event revisions, price visibility, internal and shared comments for buyers and suppliers,
keyboard submission, pending requests, and failures. The flow's `TimelineComments` story checks posted entries end to end.

## Document downloads prototype

`ProductDownloadsMenu` is shared by the PO and shipment views. Its caller supplies only applicable label types and
scopes the download to that order or shipment. `ShipmentDocuments` owns the packing list, carton labels, carrier labels,
and reference-sheet rows; pending files are disabled and carrier labels are omitted when not required.

The PO keeps the combined supplier-pack action. Ready packets reuse `renderSupplierPacket`, also used by the existing
shipment packet page. Carton/carrier files in this prototype are marked sample documents; product labels use fixture
product codes with the existing printable generators. The prototype
uses local packing state and does not persist documents or alter production release/access rules.

Product SKU/FNSKU and suffocation downloads use the existing shared printable label generators. Country-of-origin and choking-hazard label files are unavailable until supplied; the menu never substitutes a placeholder for these files.
`DetailFields` renders the shared label-above-value fields for PO details and shipment summaries. The packing form supplies live carton, unit, weight, and volume totals to its sidebar slot.

Product rows in the purchase-order prototype and shipment Products table reuse `ProductDownloadsMenu` with an
icon trigger. Row downloads contain only that variant; page-level menus retain bulk downloads.


### Shipment workflow reference and toast feedback

`Prototypes/Shipment states and actions/All Arrangements` documents the intended eight shipping arrangements in one
page. Each action shows its approval gate, next badge, canonical email event/template, recipients, default delivery,
and actor toast. Email mappings follow the Notifications session's shipment action contract; draft saves, downloads,
and routine background processing send no email. Physical pickup is distinct from dispatch.

`Components/toast-provider` covers saved drafts, shipment-action confirmations, and save failures using the shared
`ToastProvider`. Its action examples and the workflow reference share `src/lib/shipment-action-feedback.ts`; these
English review examples are not a production event publisher or a replacement for localized runtime copy.

Shipment packing headers use `ShipmentPackingDetails` in both the app and the purchase-order prototype.
`PackingDetailsFields` binds the same card to the packing form: saved supplier address, destination, transport legs,
and required ready date. The standalone shipment-packing-details stories cover editing, read-only, forwarder,
and mobile layouts; the prototype sidebar reads the date from the live form.
