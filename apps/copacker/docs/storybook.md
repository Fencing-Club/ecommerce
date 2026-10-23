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

Test runs turn animations and transitions off (`.storybook/vitest.setup.ts`, loaded only by Vitest), so no play
function sees a popup, menu or dialog halfway through fading in or out. Storybook itself keeps them for people looking
at the stories. A popup still shows from the frame after it opens, so check it with `waitFor`, or open it through
`shownDialog` or `chooseOption`, which wait for it. The stories don't retry: one that fails has a problem to fix, not a
moment it missed.

Test runs also mock each story file's requests inside its own frame. Vitest runs several story files at once, and MSW's
one service worker for all of them loses track of which frame asked: a frame's requests would get another file's
answers, or none, and its modules could fail to load. So `.storybook/vitest.setup.ts` hides the Service Worker API, and
MSW intercepts `fetch` and `XMLHttpRequest` in the page instead. Storybook itself still uses the worker.

Components compile through the React Compiler in Storybook too (`.storybook/main.ts`), as they do in the app, so play
tests run the memoized code people get. Story files themselves stay uncompiled: a page story's server half is an async
function its loader calls outside React.

Stories that render a real PDF, such as the shipping document previews, the supplier packet page and the packing list
download, carry the `documents` tag: they're there to look at, and Vitest leaves them out (`tags: { exclude:
["documents"] }` in `vitest.config.ts`), so CI never renders a document. Write the tag in the
story file itself, on the meta or the story; the test plugin reads tags from the source, so one spread in from a shared
object doesn't count. `tags: ["!documents"]` keeps a story under a tagged meta that renders nothing, such as one blocked
before its PDF.

`tests/stories.test.ts` fails when a page or component has no stories. Components with nothing to show (providers and
contexts) are listed there instead. An effect that renders nothing is a hook in `src/hooks`, not a component.

## The sidebar

Every story file sets an explicit `title` in one of six sections. `tests/stories.test.ts` checks each rule.

| Section | Holds | Title |
| --- | --- | --- |
| Foundations | The shadcn primitives in `src/components/ui` | `Foundations/<Name>` |
| Components | App components, grouped by product area | `Components/<Area>/<Name>` |
| Pages | The real routes in `src/app`, rendered with fixtures | `Pages/<Route>/<View>` |
| Prototypes | Designs built only in Storybook: in `src/stories`, or beside the route a design is for until it's built (listed in the test) | `Prototypes/<Name>` |
| Simulators | The real packing rules run on sample data, in `src/stories/simulators` and only there (see [Simulators](#simulators)) | `Simulators/<Name>` |
| Unused | Components no app code renders yet | `Unused/<Area>/<Name>` |

Component areas are App shell, Forms, Display, Purchase orders, Shipments, Booking, Products, Inventory, Sales and
costs, Integrations, Partners, Settings, Shipping documents, Supplier workspace, Auth, Onboarding and Marketing. Pages
are grouped by route, not by workspace kind: buyer and supplier views of a route are stories of the same page.

A `Pages/` story must live in `src/app` and render the route itself. Apart from fixtures, the `server`, `workspace`
and `shipping-documents` helpers, and the `play` and `actions` helpers its play function uses, it may not import from
`src/stories`, so a page story can't quietly show a copy of the page. Every other story in `src/app` must be a `Pages/` story too, unless the test lists it as a route prototype.

`Unused` is computed, not curated. The test follows imports from every route, server module and library, and a
component's stories belong in `Unused` exactly when nothing reaches the component. Wiring a component into the app
fails the test until its stories move to `Components`, and removing its last use fails it until they move to `Unused`.
Review that section for components awaiting app work or ready to delete.

## Simulators

The simulators run `@repo/copacker-packing-rules` itself on sample data, so a change to a rule or its copy shows up
here before it reaches a shipment. Nothing in them restates a limit: the examples are built from each policy's own
rules.

- **Simulators/Carton validation** and **Simulators/Pallet validation**: the carton or pallet table as the packing page
  runs it, with a data set and receiver to pick (FBA, AWD US, both networks, the buyer's warehouse). Every edit goes
  through `validatePacking`, and each issue it reports is listed below the table with the codes it can report.
- **Every Error**: one table per simulator with every error, grouped by receiver and sorted by rule. Each row gives
  the code, the rule's own `description` with the supplier's checklist line under it, the error exactly as the editor
  shows it (with its link to the receiver's rule), and the readiness line. **Open in simulator** loads that row's
  example into the simulator (`?path=/story/simulators-carton-validation--error-example&args=dataSet:<id>`), to edit
  it by hand. A new policy or rule adds its rows; a new rule type fails type checks until the examples break it; and a
  message with no example gets a red row.

Each data set lives in `src/stories/simulators/data.ts`; the Every Error examples are in `carton-examples.ts` and
`pallet-examples.ts`.

- **Simulators/Supplier packet**: the packet as production builds it. A data set (cartons or pallets, to FBA, AWD or
  the buyer's warehouse, or products with every preparation and label) and how it ships (service, handoff, collection,
  carrier labels) go through `shippingDocumentSnapshot`, with a sample Amazon label for each carton to Amazon and a
  carrier label for each when the carrier labels cartons. It shows whether production can export the packet (and the
  snapshot's reason when it can't), the checklist as the packet words it in the chosen language, and every page of the
  packet. Sample labels are bordered boxes in each provider's page size: 4 × 6 in carton labels, Letter pallet labels
  (four a pallet) and 2 × 1 in product labels. When the snapshot refuses a shipment, the pages are built from the
  packing list snapshot with the packet's labels and address, to show what the documents would print.
- **Every Checklist Line**: every line the checklist can print, built from the checklist rules across the data sets and
  ways to ship them (`packet-catalog.tsx`): each product requirement, then each carton, pallet and handoff line, when
  it's printed, whether production's export reaches it, and a link that opens a shipment printing it in the simulator.

The packet's data sets are in `packet-data.ts`.

Simulators are for trying the rules and documents by hand, so test runs leave them out: every simulator's
stories carry the `simulator` tag, which `vitest.config.ts` excludes, and `tests/stories.test.ts` fails on a simulator
without it. The packet's stories also carry `documents`, since they render PDFs. The rules themselves are tested in
`@repo/copacker-packing-rules` and the app's own tests.

## The toolbar

- **Theme**: light or dark. It chooses that theme in the app's theme store, as the account menu does
  ([styling](styling.md#theme)).
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
  `parameters: { db: { contacts: [...] } }`; the preview's loader sets those rows before every story, so a story
  without the parameter finds none.

- **API calls** go through Mock Service Worker. `.storybook/mocks/handlers.ts` has the defaults (changes succeed, lists
  are empty); a story overrides them in `beforeEach({ msw })` with `msw.use(http.get(...))`.
- **Changes** (`POST /api/action`) are recorded with `recordActions(sent, answer?)` from `@/stories/actions`, for
  `msw.use` in a `beforeEach` or play function. It keeps each change in the story's `sent` list (a module-level
  `ActionRequest[]` it starts over each time) and answers with `answer`, or success. `failWith(message, status?)`,
  `redirectTo(path)` and `held` are the common answers.
- **Permissions**: stories run as the workspace owner. Set `parameters: { permissions: member }` (from
  `@/stories/workspace`) to see what a member sees.
- **Fixtures** live in `src/stories/fixtures/<area>.ts`, typed with the app's own types. The companies and addresses
  several areas share are in `fixtures/parties.ts`.
- **Navigation**: `.storybook/router.tsx` creates a real TanStack memory router per story. Set
  `parameters: { router: { navigation: { pathname, query } } }` for components that read the URL.
  `getStoryRouter()` exposes recorded navigate/invalidate calls for assertions.

### Play helpers

`@/stories/play` has what play functions share:

- `shownDialog(name?)` and `shownAlertDialog(name?)` wait for a dialog, sheet, popover or confirmation to show, and
  give queries for what's inside it, with the dialog itself as `element`.
- `chooseOption(control, option)` opens a select or combobox, picks an option and waits for the list to close, so the
  next step never meets a list that's going away. For a list that stays open, such as a multiple choice, click the
  options directly.
- `chooseMenuItem(trigger, item)` does the same for a menu. A closing menu keeps its items until it's gone, without
  taking clicks, so opening a menu with the same items again too soon finds the old one's. `closeMenu()` closes an
  open menu with Escape and waits for it to go.
- `settled()` waits a couple of frames for what a component schedules as it mounts. `chooseOption` calls it; call it
  before a play function's first typing or click when that comes before anything else.
- `width(className)` is a decorator that shows a story in a column of a Tailwind width (`"w-72"`, `"max-w-lg"`): the
  room the component has in the app.

Wait for what the story is about, not for time: `findBy…`, `waitFor`, or a callback's own signal. A story that checks
that nothing happens shows the reason it can't, such as a form the browser refuses to submit.

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
`ToastProvider`. Its action examples and the workflow reference share
`src/stories/fixtures/shipment-action-feedback.ts`; these English review examples are not a production event publisher
or a replacement for localized runtime copy.

Shipment packing headers use `ShipmentPackingDetails` in both the app and the purchase-order prototype.
`PackingDetailsFields` binds the same card to the packing form: saved supplier address, destination, transport legs,
and required ready date; a packed shipment shows its pickup address with `ShipmentOrigin`, without a form. The
standalone shipment-packing-details stories cover editing, read-only, forwarder, and mobile layouts; the prototype
sidebar reads the date from the live form.
