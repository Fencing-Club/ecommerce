# Localization

Copacker is translated with [next-intl](https://next-intl.dev), without locale prefixes in URLs. English is the source
language. Translations are written by hand (or with an AI assistant) into JSON files; no translation service is called.

## Which language a page renders in

`src/i18n/request.ts` picks the language for every page, route handler and server action:

1. The language the signed-in person chose in **Settings > Language** (`profiles.locale`).
2. Otherwise, the computer's language, from the browser's `Accept-Language` header (`negotiateLocale`).
3. Otherwise, English.

`LocalizationProvider` (in `AppProviders`, which every layout of the app renders) passes that language, its messages
and the time zone to client components. The marketing pages pass only the parts their client components use
(`ClientMessages`), so their HTML doesn't carry every area's messages; a marketing client component that starts using
another namespace needs it added to its page's list.
Dates format in the time zone the browser last reported (the `tz` cookie), so the server and browser render the same
text. Worker jobs and emails have no request: use `translatorFor(profile.locale)` from `src/i18n/translator.ts`.

Supported languages are listed in `src/i18n/locales.ts`: English, Spanish (Mexico), French, German, Italian, Ukrainian,
Simplified Chinese, Hindi and Urdu. Urdu reads right to left: `direction()` in the same file sets the page's `dir`.

Urdu is set in Noto Nastaliq Urdu, whose letters rise and hang far past the line Latin text sits on. `globals.css`
gives Urdu's body sizes taller lines, and a headline with a tight `leading-[…]` adds `urdu:leading-[1.6]
urdu:tracking-normal` (the `urdu:` variant is also in `globals.css`). Text clipped to its box, such as `lit`'s gradient,
needs room past the line too.

## Messages

- One file per area and language (namespaces such as `common`, `orders`, `errors` for failures the server returns,
  `server` for other text the server builds, `notifications` and `emails` for what the worker sends): `apps/copacker/messages/<locale>/<namespace>.json`. The namespaces are fixed in
  `src/i18n/messages.ts`; adding one means adding its import there and a file in every locale.
- English (`messages/en`) is the source and the type: `useTranslations`/`getTranslations` keys are type-checked against
  it. Every other language is merged over English, so an untranslated key shows the English text.
- Keys are camelCase and nested by component or page, such as `orders.builder.submit`. Name keys for their meaning, not
  their text.
- Use ICU syntax for values and plurals: `"{count, plural, one {# product} other {# products}}"`. Never build a sentence
  by concatenating translated fragments; pass values instead. Use `t.rich` for sentences with links or bold text.
- Every key in `messages/en` must exist in every other locale with the same ICU arguments.

## In code

- Server components, `generateMetadata`, route handlers: `const t = await getTranslations("orders")`.
- Client components: `const t = useTranslations("orders")`.
- Page titles: replace `export const metadata` with `generateMetadata` that calls `getTranslations`.
- Numbers, dates and currency: use `useFormatter()`/`getFormatter()`, or pass `useLocale()`/`getLocale()` to `Intl` and
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

## Adding a language

Add it to `locales` and `localeNames` in `src/i18n/locales.ts`, copy `messages/en` to `messages/<locale>`, and translate
every file.
