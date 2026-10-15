import { AsyncLocalStorage } from "node:async_hooks"
import { isLocale, negotiateLocale, type Locale } from "@/i18n/locales"
import { english, loadMessages, type Messages } from "@/i18n/messages"
import { isTimeZone } from "@/lib/time-zone"

type Localization = { locale: Locale; messages: Messages; timeZone: string }
type Resolver = () => Promise<Localization | undefined>
const requests = new AsyncLocalStorage<{ resolve: Resolver; pending?: ReturnType<Resolver> }>()
const defaults: Localization = { locale: "en", messages: english, timeZone: "UTC" }

// Establish this at each framework's request boundary. Resolve lazily: a webhook or health check that never needs
// translated text must not look up a session or profile. Nested operations share one lookup within the request.
export function withLocalization<T>(resolve: Resolver, run: () => T): T {
  return requests.getStore() ? run() : requests.run({ resolve }, run)
}

async function current() {
  const request = requests.getStore()
  if (!request) {
    return undefined
  }
  return (request.pending ??= request.resolve())
}

// Background jobs have English text and UTC dates, but no request language to attach to an outgoing email job.
export async function localization(): Promise<Localization> {
  return (await current()) ?? defaults
}

export async function requestLocale() {
  return (await current())?.locale
}

// Profile language takes precedence over browser preferences. Both framework adapters use the same validation and
// catalog loading; unsupported preferences and an untrusted time-zone cookie cannot break formatting.
export async function resolveLocalization(input: {
  preferredLocale?: unknown
  acceptLanguage: string | null
  timeZone?: string
}): Promise<Localization> {
  const locale = isLocale(input.preferredLocale) ? input.preferredLocale : negotiateLocale(input.acceptLanguage)
  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: input.timeZone && isTimeZone(input.timeZone) ? input.timeZone : "UTC"
  }
}
