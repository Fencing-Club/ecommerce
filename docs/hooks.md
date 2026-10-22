# React Hooks

Hook conventions, and the full catalog of [`@mantine/hooks`](https://mantine.dev/hooks/use-disclosure/) so you **reach
for an existing hook before writing your own**. For exact signatures/options, follow the link to the Mantine docs for
each hook.

## Conventions

- **Reuse first.** Check Copacker's hooks and the catalog below before writing a hook.
- **File names are kebab-case**: `use-{name}.ts`, colocated with the feature or in `apps/copacker/src/hooks` when
  shared. A file may export a few closely related hooks (see `use-error-text.ts`). `useActionForm.ts` predates this,
  and keeps its name until the open pull requests that import it land.
- **The React Compiler is on.** Don't hand-write `useMemo`, `useCallback`, or `React.memo` for performance; follow the
  Rules of React.
- **Follow the Rules of Hooks** (call unconditionally, at the top level). oxlint's `react/rules-of-hooks` enforces this.

## Copacker hooks (`apps/copacker/src/hooks`)

- `useAction` (`use-action.ts`): runs one mutation, by its `/api/action` name or as another request, and returns
  `{ run, pending, error, reset }`. `run` never throws; a failure's message is in `error` (and goes to `onError`). After
  success it opens the action's redirect, or awaits `router.invalidate({ sync: true })` when there's none, so pending
  lasts until the result shows and `onSuccess` runs on fresh data. `navigation: "document"` opens the redirect as a new
  document, for anything that changes the session or workspace. Use it for every button, menu item and dialog that
  runs an action; `ConfirmDialog` and `ActionButton` are built on it. Another request, such as a connection's own
  endpoint, refreshes what it needs itself.
- `useActionForm` (`useActionForm.ts`): the one form hook. React Hook Form + Zod, a server error on `root.server`, and
  `useAction`'s step after success, then `onSuccess(result, values)` and a reset for the next entry (or `keepSaved`).
  Pass `action` to post to `/api/action`, or `run` for a form a parent saves, such as linking a shipment. Sign-in and
  recovery forms pass `navigation: "document"`.
- `useSwitchWorkspace` (`use-switch-workspace.ts`): opens another workspace as a fresh document and tells the browser's
  other tabs. Used by the workspace menu, which shows a failure as a toast, and the workspace picker.
- `useMoney` (`use-money.ts`): formats minor-unit amounts in the page's locale. Use it for any price or total. An amount
  typed outside a form's `FormMoney` goes in `MoneyInput` (`components/money-input.tsx`), which reports minor units as
  they're typed.
- `useMessageText`, `useFormErrorMap`, `useErrorMessage` (`use-error-text.ts`): translate a message key or pass text
  through; localized Zod field errors for `zodResolver`; localized `errorMessage` with generic and offline fallbacks.
  Use them when showing validation or request errors outside `useAction` and `useActionForm`.
- `useIsMobile` (`use-mobile.ts`): `true` below 768px, `false` on the server. Used by shadcn's sidebar; use it for
  layout switches that CSS can't handle.

## `@mantine/hooks` catalog

### State

- `useCounter` — integer counter with `increment`/`decrement`/`set`/`reset`.
- `useToggle` — cycle through a list of values (boolean by default).
- `useDisclosure` — boolean with `{ open, close, toggle }` handlers (modals, drawers, popovers).
- `useSetState` — partial state merges, like class `setState`.
- `useInputState` — state helper for controlled inputs (accepts an event or a value).
- `useListState` — array state with `append`/`prepend`/`insert`/`remove`/`reorder`/`setItem`/`apply`.
- `useMap` / `useSet` — reactive `Map` / `Set` that re-render on mutation.
- `useQueue` — fixed-capacity queue with overflow handling.
- `useStateHistory` — value with `back`/`forward`/`reset` history (undo/redo).
- `useValidatedState` — value plus its validation state.
- `useUncontrolled` — manage a component that can be controlled or uncontrolled.
- `usePagination` — pagination model: `active`, `range`, `next`, `previous`, `setPage`.
- `useSelection` — multi-select list state (select/deselect/toggle/all).
- `useForceUpdate` — return a function that forces a re-render.

### Timing — debounce / throttle / intervals

- `useDebouncedValue` — debounced copy of a changing value.
- `useDebouncedState` — state whose updates are debounced.
- `useDebouncedCallback` — a debounced callback.
- `useThrottledValue` / `useThrottledState` / `useThrottledCallback` — throttled equivalents.
- `useInterval` — managed `setInterval` with `start`/`stop`/`toggle`.
- `useTimeout` — managed `setTimeout` with `start`/`clear`.

### Storage & URL

- `useLocalStorage` — state synced to `localStorage` (and across tabs).
- `useSessionStorage` — state synced to `sessionStorage`.
- `useHash` — state synced to the URL hash.

### Lifecycle & refs

- `useDidUpdate` — effect that skips the first render.
- `useShallowEffect` — effect with shallow dependency comparison.
- `useIsomorphicEffect` — `useLayoutEffect` on the client, `useEffect` on the server.
- `useMounted` — boolean: has the component mounted.
- `useIsFirstRender` — boolean: is this the first render.
- `usePrevious` — the previous value of a variable.
- `useMergedRef` — merge multiple refs into one callback ref.
- `useLogger` — log a component's lifecycle and props (debugging).

### DOM interaction

- `useClickOutside` — detect clicks/taps outside a ref (dismiss menus/modals).
- `useHover` — `{ ref, hovered }` for hover state.
- `useFocusWithin` — boolean: focus is within the subtree.
- `useFocusTrap` — trap keyboard focus inside an element (modals).
- `useFocusReturn` — return focus to the trigger after an overlay closes.
- `useEventListener` — attach an event listener to an element via ref.
- `useWindowEvent` — attach a `window` event listener for the component's lifetime.
- `useMove` — track pointer movement over an element (sliders, color pickers).
- `useDrag` — drag interactions with position state.
- `useRadialMove` — angular/radial movement (dials, knobs).
- `useLongPress` — long-press gesture handler.
- `useResizeObserver` — observe an element's size via `ResizeObserver`.
- `useMutationObserver` — observe DOM mutations on an element.
- `useIntersection` — `IntersectionObserver` for an element (lazy loading, reveal).
- `useInViewport` — simple "is this element in the viewport" boolean.
- `useScrollIntoView` — animated scroll of an element into view.
- `useRovingIndex` — roving `tabindex` keyboard navigation for a group.
- `useSplitter` — resizable split-pane sizing.

### Scroll, viewport & window

- `useViewportSize` — reactive window `{ width, height }`.
- `useWindowScroll` — scroll position + `scrollTo`.
- `useScrollDirection` — current scroll direction (up/down).
- `useScrollSpy` — the active section based on scroll position.
- `useHeadroom` — show/hide a sticky header based on scroll direction.
- `usePageLeave` — callback when the pointer leaves the document.
- `useMouse` — current mouse position (optionally relative to a ref).
- `useTextSelection` — the current `Selection` on the page.

### Environment & device

- `useMediaQuery` — subscribe to a CSS media query.
- `useColorScheme` — the system light/dark preference.
- `useReducedMotion` — `prefers-reduced-motion` boolean.
- `useOrientation` — device/screen orientation.
- `useOs` — detected operating system.
- `useNetwork` — online status + connection info.
- `useDocumentVisibility` — whether the tab is visible.
- `useDocumentTitle` — set `document.title`.
- `useFavicon` — set the page favicon.
- `useIdle` — boolean: user has been idle past a timeout.
- `useFullscreenElement` / `useFullscreenDocument` — enter/exit fullscreen for an element or the page.
- `useEyeDropper` — the browser EyeDropper API.
- `useFileDialog` — open a file picker without an `<input>`.
- `useClipboard` — `copy(value)` + `copied` state.
- `useFetch` — minimal fetch wrapper with `loading`/`error`/`data`.
- `useMask` — masked input formatting.

### Utilities

- `useId` — a stable unique id (SSR-safe).
- `useHotkeys` — register global keyboard shortcuts.
- `useCollapse` — animated height collapse/expand.
- `useColorScheme` — see Environment above.
- `useFloatingWindow` — render content into a floating/popup browser window.

> Not listed here but present, plus exact options and return shapes: see the
> [Mantine hooks docs](https://mantine.dev/hooks/use-disclosure/).
