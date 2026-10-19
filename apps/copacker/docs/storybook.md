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

A browser that can't register the mock service worker, such as the Claude desktop app's, still renders every story:
the preview logs the failure, and requests MSW would answer go unanswered. Play functions that type or press keys can
fail there although the story works; Vitest's Chromium is the reference.

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

### List design review

`Pages/Buyer/Purchase orders/List` and `Pages/Buyer/Shipments/List` present the approved Pen list layouts
(`awIJu` and `OzQcA`) in the current app shell. They share `src/stories/logistics-lists.tsx` and fictional fixtures.
Search, filters, saved views, column visibility, selection, pagination and CSV export operate on those fixtures only.
They do not replace the live list routes yet. The older Required by column/filter is intentionally omitted;
the current shell keeps its sidebar collapse control. Counts reflect the fixture records rather than static totals.
Shipment tabs are Needs you, Active, Received and All; purchase orders also retain Drafts and use Closed.
Supplier stays beside search; Status, Destination, Forwarder, Source (shipments only) and Ready date (shipments only)
are inside Filters. Applied filters have removable chips, and dates start unset.
Mobile stories preserve the table with horizontal scrolling; empty and no-results stories cover both lists.

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

Below 640 px of content width, the list previews hide the column chooser and switch to compact rows: reference, supplier and route stay together, with status and shipment details or order totals alongside. Search occupies a full toolbar row below 760 px; sort becomes icon-only below 480 px. Tablet and desktop lists retain real columns and the column chooser; their table can scroll when the selected columns need more space.

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
`DetailFields` renders the shared label-above-value fields for PO details and shipment summaries. The packing form supplies live carton, weight, and volume totals to its sidebar slot.

Product rows in the purchase-order prototype and shipment Products table reuse `ProductDownloadsMenu` with an
icon trigger. Row downloads contain only that variant; page-level menus retain bulk downloads.


### Shipment workflow reference and toast feedback

`Workflows/Shipments/States and actions/All Arrangements` documents the intended eight shipping arrangements in one
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

## Amazon booking dialogs

`Components/Booking` holds the AGL and FBA booking dialogs from `copacker.pen` (06.18 and 06.17). They are UI only:
nothing is wired to the server or Amazon yet. The `AglBookingDialog` and `FbaBookingDialog` stories cover every step and
problem, and each checks that the dialog keeps its one height (`bookingDialog` in `src/stories/fixtures/booking.ts`).

Both flows build on one component per concept in `src/components/booking`: `BookingDialog` (512px wide, one height,
a body that scrolls and takes focus only when it overflows), `IssueSummary` and `IssuesView` (one problem in place with
its fix, several as a count with Review), `ShipmentPicker`, `TemplateSlot`, `FileRow` with `DownloadAction` and
`OpenAction`, `OptionList` and `SummaryList`.

Before wiring FBA, settle the open product question: `src/server/fba-shipments.ts` books with the buyer's own carrier
by default, while the design leads with Amazon's quotes.
