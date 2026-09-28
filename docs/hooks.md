# React Hooks

## Conventions

- **Reuse first.** Check Copacker's hooks and `@mantine/hooks` below before writing a hook.
- **File names are kebab-case**: `use-{name}.ts`, colocated with the feature or in `apps/copacker/src/hooks` when
  shared. A file may export a few closely related hooks (see `use-error-text.ts`). `useActionForm.ts` predates this.
- **The React Compiler is on.** Don't hand-write `useMemo`, `useCallback`, or `React.memo` for performance; follow the
  Rules of React.
- **Follow the Rules of Hooks** (call unconditionally, at the top level). oxlint's `react/rules-of-hooks` enforces this.

## Copacker hooks (`apps/copacker/src/hooks`)

- `useActionForm` (`useActionForm.ts`): React Hook Form + Zod form that posts to `/api/action`, shows server errors on
  `root.server`, then redirects or resets and refreshes. Use it for every form that submits an action.
- `useMoney` (`use-money.ts`): formats minor-unit amounts in the page's locale. Use it for any price or total.
- `useMessageText`, `useFormErrorMap`, `useErrorMessage` (`use-error-text.ts`): translate a message key or pass text
  through; localized Zod field errors for `zodResolver`; localized `errorMessage` with generic and offline fallbacks.
  Use them when showing validation or request errors outside `useActionForm`.
- `useIsMobile` (`use-mobile.ts`): `true` below 768px, `false` on the server. Used by shadcn's sidebar; use it for
  layout switches that CSS can't handle.

## `@mantine/hooks`

Prefer [`@mantine/hooks`](https://mantine.dev/hooks/use-disclosure/) (v9) over hand-rolled hooks. Common ones:

- State: `useDisclosure`, `useToggle`, `useListState`, `useSetState`, `useUncontrolled`, `usePrevious`.
- Timing: `useDebouncedValue`, `useDebouncedCallback`, `useThrottledValue`, `useInterval`, `useTimeout`.
- DOM: `useClickOutside`, `useHover`, `useFocusTrap`, `useResizeObserver`, `useElementSize`, `useIntersection`,
  `useInViewport`, `useEventListener`, `useWindowEvent`.
- Environment: `useMediaQuery`, `useColorScheme`, `useReducedMotion`, `useViewportSize`, `useDocumentVisibility`,
  `useNetwork`, `useIdle`.
- Other: `useClipboard`, `useHotkeys`, `useLocalStorage`, `useSessionStorage`, `useId`, `useMergedRef`, `useFileDialog`.

See the [Mantine hooks docs](https://mantine.dev/hooks/use-disclosure/) for the full list and signatures.
