import { createFormatter, createTranslator } from "use-intl"
import { storyIntl } from "../intl"

// next-intl/server for the browser: what a server component reads during a request, answered from the story's
// language. The app's own request config (src/i18n/request.ts) reads the database and cookies, so it isn't used.

type Options = { locale?: string; namespace?: string }

export async function getTranslations(namespaceOrOptions?: string | Options) {
  const { locale, messages, timeZone } = storyIntl()
  const namespace = typeof namespaceOrOptions === "string" ? namespaceOrOptions : namespaceOrOptions?.namespace
  // The translator's namespace is typed against the messages; a server component's own call is already checked.
  return createTranslator({ locale, messages, timeZone, namespace: namespace as never })
}

export async function getFormatter() {
  const { locale, timeZone } = storyIntl()
  return createFormatter({ locale, timeZone })
}

export async function getLocale() {
  return storyIntl().locale
}

export async function getMessages() {
  return storyIntl().messages
}

export async function getTimeZone() {
  return storyIntl().timeZone
}

export async function getNow() {
  return new Date()
}

export function getRequestConfig<T>(config: T) {
  return config
}
