import { createFormatter, createTranslator, type NamespaceKeys, type NestedKeyOf } from "use-intl"
import { isLocale, type Locale } from "@/i18n/locales"
import { english, loadMessages, type Messages } from "@/i18n/messages"

// Dates and times in stories read in one zone, so a story shows the same day on every computer.
export const storyTimeZone = "America/Los_Angeles"

type Intl = { locale: Locale; messages: Messages; timeZone: string }

// The language the toolbar picked, for the mocked #.storybook/intl that server components read.
let current: Intl = { locale: "en", messages: english, timeZone: storyTimeZone }
const loading = new Map<Locale, Promise<Messages>>([["en", Promise.resolve(english)]])

// Loads the toolbar's language and makes it the one server components read. Loaders run side by side, so each one
// that renders a server component awaits this before it does.
export async function prepareIntl(global: unknown) {
  const locale: Locale = isLocale(global) ? global : "en"
  let messages = loading.get(locale)
  if (!messages) {
    messages = loadMessages(locale)
    loading.set(locale, messages)
  }
  current = { locale, messages: await messages, timeZone: storyTimeZone }
  return current
}

export function storyIntl() {
  return current
}

export async function translateStory<Namespace extends NamespaceKeys<Messages, NestedKeyOf<Messages>> = never>(
  namespace?: Namespace
) {
  return createTranslator({ ...storyIntl(), namespace })
}
export async function formatStory() {
  return createFormatter(storyIntl())
}
export async function localeStory() {
  return storyIntl().locale
}
