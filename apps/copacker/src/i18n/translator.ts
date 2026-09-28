import { createTranslator } from "next-intl"
import { defaultLocale, isLocale, type Locale } from "./locales"
import { loadMessages } from "./messages"

// Translations outside a page or route, such as in the worker's jobs and emails, in a person's chosen language (the
// profile's locale) or English when they haven't chosen one.
export async function translatorFor(locale: string | null | undefined) {
  const chosen: Locale = isLocale(locale) ? locale : defaultLocale
  return createTranslator({ locale: chosen, messages: await loadMessages(chosen) })
}
