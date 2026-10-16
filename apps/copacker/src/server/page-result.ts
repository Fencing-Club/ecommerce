import { notFound } from "@tanstack/react-router"
import { setResponseStatus } from "@tanstack/react-start/server"
import { createTranslator } from "use-intl"
import { AccessError, NotFoundError } from "@/i18n/errors"
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
