# Localization

Copacker uses the standalone [use-intl core](https://next-intl.dev/docs/environments/core-library) for client hooks,
shared translators, TanStack Start and Storybook. URLs have no locale prefixes. English is the source language. Translations live in JSON
files; no translation service is called.

## Which language a page renders in

`src/server.ts` resolves the language for every page, route handler and server function:

1. The language the signed-in person chose in **Settings > Language** (`profiles.locale`).
2. Otherwise, the computer's language, from the browser's `Accept-Language` header (`negotiateLocale`).
3. Otherwise, English.

The root document's `IntlProvider` passes that language, its messages and the time zone to components.
`src/document.functions.ts` limits public pages to their required message namespaces; add a newly required namespace
there when a public component starts using it.
Dates format in the time zone the browser last reported (the `tz` cookie), so the server and browser render the same
text. Worker jobs and emails have no request: use `translatorFor(profile.locale)` from `src/i18n/translator.ts`.

Shared server operations use `src/server/localization.ts`, which holds a lazy configuration lookup in
`AsyncLocalStorage`. Each request owns its lookup, including overlapping Workers invocations. Nested operations reuse
it; requests that never need translated text do not read profiles or sessions for localization. `src/server.ts`
establishes the boundary before Start dispatches the request. `resolveLocalization` validates profile/browser preferences
and the reported time zone.
Server errors, pricing, preparation instructions and store dates use standalone `use-intl` through this context.
Outside a request they use English/UTC, and `requestLocale()` returns `undefined` for email-job payloads. Storybook
mocks the context with its selected toolbar language. The compatibility probe exercises the same domain helpers.

Supported languages are listed in `src/i18n/locales.ts`: English, Spanish (Mexico), French, German, Italian, Ukrainian,
Simplified Chinese, Hindi and Urdu. Urdu reads right to left: `direction()` in the same file sets the page's `dir`.

Every page preloads Geist's Latin face. Ukrainian, Hindi and Urdu pages also preload one file for their script
(Geist's Cyrillic, Noto Sans Devanagari, Noto Nastaliq Urdu) from `src/styles/fonts/`, which the root layout names
first in the page's font stack, so their text doesn't move when the font arrives.

Urdu is set in Noto Nastaliq Urdu, whose letters rise and hang far past the line Latin text sits on. `globals.css`
gives Urdu's body sizes taller lines, and a headline with a tight `leading-[…]` adds `urdu:leading-[1.6]
urdu:tracking-normal` (the `urdu:` variant is also in `globals.css`). Text clipped to its box, such as `lit`'s gradient,
needs room past the line too.

## Messages

- One file per area and language (namespaces such as `common`, `orders`, `errors` for failures the server returns,
  `server` for other text the server builds, `notifications` and `emails` for what the worker sends): `apps/copacker/messages/<locale>/<namespace>.json`. The namespaces are fixed in
  `src/i18n/messages.ts`; adding one means adding its import there and a file in every locale.
- English (`messages/en`) is the source and the type: `useTranslations`/`serverTranslator` keys are type-checked against
  it. Every other language is merged over English, so an untranslated key shows the English text.
- Keys are camelCase and nested by component or page, such as `orders.builder.submit`. Name keys for their meaning, not
  their text.
- Use ICU syntax for values and plurals: `"{count, plural, one {# product} other {# products}}"`. Never build a sentence
  by concatenating translated fragments; pass values instead. Use `t.rich` for sentences with links or bold text.
- Every key in `messages/en` must exist in every other locale with the same ICU arguments.

## In code

- Loaders, server functions and HTTP handlers: `const t = await serverTranslator("orders")` from `@/server/translation`.
- Framework-independent server operations: `createTranslator({ ...(await localization()), namespace: "orders" })`.
- Client components: `const t = useTranslations("orders")`, imported from `use-intl`.
- Page titles: return translated metadata through the route's `head` function and render `HeadContent` in the root.
- Numbers, dates and currency: use `useFormatter()`, `createFormatter(await localization())`, or pass the resolved locale to `Intl` and
  to `toLocaleString`, keeping any explicit `timeZone` option. Never hard-code `"en-US"` for display.
- Form validation: a message written on a zod schema is a full message key in the owning area's namespace, such as
  `z.string().min(1, "settings.profile.enterCompany")`. Form fields and the action route translate a message that is a
  known key and show any other text as it is. The generic messages (required, too long) come from `formErrorMap`,
  translated from the `validation` namespace.
- Errors the server returns to a person: throw `LocalizedError` (`src/i18n/errors.ts`) with an `errors` key and values;
  the action route translates it into the request's language.
- Purchase order timeline events are stored as an `orders.timeline.events` key and its values (`messageKey`,
  `messageValues`; see `src/lib/timeline-events.ts`), never as text, and read in each reader's language. Only comments
  keep text in `message`. A revision's `reason` is one of those keys too.
- `@repo/aisle` returns what the supplier must do (`itemRequirements`, `destinationRequirements`) and packing rule
  failures (`validatePacking`) as codes and values, never text. The app words them from `shipments.requirements`
  (`src/server/requirements.ts`) and `server.readiness.packing`; the package's `requirementText` is the English its PDFs
  print, since documents stay in English.
- Product names, store names, SKUs, addresses and other data people typed stay as they are.
- File names read left to right in every language; in Urdu, 1043.pdf would otherwise read pdf.1043. Show one with
  `fileName()` from `@/components/common`, an inline `<span dir="ltr">` that keeps its line's alignment. In a message,
  tag the name, `"Uploaded, <file>{name}</file>"`, and pass `file: fileName` to `t.rich`. A tooltip takes the
  direction of the element with the `title`, so a line that truncates a name shows it whole with
  `fileName(name, { title: name })` rather than a `title` on the line.

## Adding a language

Add it to `locales` and `localeNames` in `src/i18n/locales.ts`, copy `messages/en` to `messages/<locale>`, and translate
every file.

## Self-hosted fonts

`src/styles/document-fonts.ts` supplies the same self-hosted Geist/Geist Mono subsets, fallback metrics, language-specific
faces and preload URLs to the Start document and compatibility fixture. All font files, including the marketing
planner's Caveat, are checked in with their licenses. Builds do not request fonts from Google.
