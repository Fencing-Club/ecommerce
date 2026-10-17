import { notFound } from "@tanstack/react-router"
import { setResponseStatus } from "@tanstack/react-start/server"
import { createTranslator, type MessageKeys, type NestedKeyOf } from "use-intl"
import { AccessError, NotFoundError } from "@/i18n/errors"
import type { Messages } from "@/i18n/messages"
import { localization } from "./localization"

// Start serializes this explicit outcome; domain exceptions and internal records never become page error payloads.
export async function pageResult<T>(read: () => Promise<T>) {
  try {
    return { page: await read(), forbidden: false as const }
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw notFound()
    }
    if (!(error instanceof AccessError)) {
      throw error
    }
    setResponseStatus(403)
    const t = createTranslator(await localization())
    return { forbidden: true as const, title: t("common.pages.forbidden.title") }
  }
}

type TitleKey = MessageKeys<Messages, NestedKeyOf<Messages>>

// Give routes a localized title in their loader result so Start manages one document title during SSR and navigation.
export function localizedPage<T>(read: () => Promise<T>, title: TitleKey | ((page: T) => TitleKey)) {
  return pageResult(async () => {
    const data = await read()
    const t = createTranslator(await localization())
    return { data, title: t(typeof title === "function" ? title(data) : title) }
  })
}
