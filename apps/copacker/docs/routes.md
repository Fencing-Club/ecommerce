# Routes: page loaders, titles, search params and error pages

`src/routes` holds the TanStack route tree. A route file says which server function loads the page and which page in
`src/app` renders it; what every page route shares is in `src/routes/-page-route.tsx` (the `-` keeps it out of the tree).

## A portal page

```tsx
export const Route = createFileRoute("/_portal/catalogs_/$id")({
  loader: ({ params }) => readCatalog({ data: { id: params.id } }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
```

- **Loader.** A server function in a `src/*.functions.ts` file reads the page through `pageResult(read, titleKey)`
  (`server/page-result.ts`). It returns `{ forbidden: false, title, data }`, or `{ forbidden: true, title }` with a 403
  when the viewer's grants refuse the page. A `NotFoundError` is Not found.
- **Workspace kinds.** Pages only some kinds of workspace have go through `workspacePage({ kinds, elsewhere, title, read })`
  in `workspace.functions.ts`: another kind goes to its home (`homeFor`), or to `elsewhere` when the page names one, and
  `read` returning null is Not found.
- **Page.** `PortalPage` renders the portal's `forbidden.tsx` for No access, or calls its child with the data. A page's
  props are typed with `PageData<typeof readX>`.
- **Record ids.** A page's id from its URL goes to the server function as any string and through `pageId` there (see
  [API](api-contract.md)).

## Titles

Every page's document title is its own title, then the app's: `Purchase orders | Copacker` (`pageTitle` in
`lib/page-title.ts`). A loader returns `title` in the viewer's language (`pageResult`, or `titleFor(key)` for the pages
outside the portal) and the route's `head` is `pageHead`. Pages without a loader (the marketing and legal pages and
`/setup`) take theirs from the document loader, `readDocument`. A page with no loaded data, such as Not found, leaves the
document's title.

## Search params

Each page's search params are a zod schema in `lib/page-search.ts` (the sign-in pages' is `authSearch` in
`lib/auth-pages.ts`, and the invitation's and getting started's sit beside their server functions). The schema is the
route's `validateSearch`, the page reads it with `Route.useSearch()`, links build it with `search`, and a server function
that reads it validates it again. A value that doesn't fit is dropped, so an old or hand-edited link still opens the
page.

- **What reaches the server.** A loader gets only the params that change its data, through `loaderDeps`: the Overview's
  period and channel, the partner list's type and search, a new purchase order's variants. Params the page only starts
  from, such as a list's `?view=` or `?tab=` or a search box's `?q=`, go from `Route.useSearch()` to the page, so changing
  them loads nothing. Dialog params that nuqs owns (`?add=`, `?import=`) are in the schema but never in `loaderDeps`.
- **Old links.** `/orders?status=` is no longer read; the list's `?view=` replaced it.

## Reloads

A navigation reloads only what it changes.

- **The document** (`__root.tsx`): `readDocument` returns the messages and head for a document key (`lib/document-key.ts`):
  every portal page shares one, the public pages another, and each marketing page and `/setup` has its own head. The root
  reloads only when the key changes, comparing the next page's key with the `data-document` the page was rendered with.
- **The portal's shell** (`_portal.tsx`): `readPortal` loads on entering the portal and when the router is invalidated,
  such as after an action. Each page's loader checks the session itself, and `WorkspaceWatch` checks on every page change
  that the workspace is still the one the shell shows.
- **A page** reloads when it's entered, when its `loaderDeps` change, or on invalidation.
- **A page that reads some of its search itself** shares one loaded result across those URLs, so it sets
  `shouldReload: reloadOnEnter` (`routes/-page-route.tsx`). Opening it again then always loads it, as a new URL would. A
  page's age can't be trusted for this: a page rendered on the server carries the server's clock, and one ahead of the
  browser's makes the page look fresh, such as a list opened again after an action deleted one of its rows.

## Error pages

Trying again invalidates the router, then clears the error, so the page loads afresh.

- **Outside the portal**, and the portal's shell itself: the router's default, `RouteError`, renders `app/error.tsx` on
  its own.
- **A portal page**: `PortalRouteError` renders `app/(portal)/error.tsx` inside the shell.
- **A sign-in page**: `AuthRouteError` renders `app/(auth)/error.tsx` inside the sign-in layout.
