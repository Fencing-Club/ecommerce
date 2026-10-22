import { notFound } from "@tanstack/react-router"
import { setResponseStatus } from "@tanstack/react-start/server"
import { createTranslator, type MessageKeys, type NestedKeyOf } from "use-intl"
import { AccessError, NotFoundError } from "@/i18n/errors"
import type { Messages } from "@/i18n/messages"
import { localization } from "./localization"

export type TitleKey = MessageKeys<Messages, NestedKeyOf<Messages>>

// A portal page's loader result: its data and title, or No access with that page's title. Start serializes this
// explicit outcome; domain exceptions and internal records never become page error payloads.
export type PageResult<T> = { forbidden: false; title: string; data: T } | { forbidden: true; title: string }

// The data a portal page's server function returns when the viewer may open the page.
export type PageData<F extends (...args: never[]) => Promise<unknown>> = Extract<
  Awaited<ReturnType<F>>,
  { forbidden: false }
>["data"]

// A page's title in the viewer's language, for a page's loader to return as `title`.
export async function titleFor(key: TitleKey) {
  return createTranslator(await localization())(key)
}

// Read a portal page with its title in the viewer's language, so Start manages one document title during SSR and
// navigation. A missing record is Not found, and a refused grant is No access, answered with a 403.
export async function pageResult<T>(
  read: () => Promise<T>,
  title: TitleKey | ((data: T) => TitleKey)
): Promise<PageResult<T>> {
  try {
    const data = await read()
    const t = createTranslator(await localization())
    return { forbidden: false, title: t(typeof title === "function" ? title(data) : title), data }
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw notFound()
    }
    if (!(error instanceof AccessError)) {
      throw error
    }
    setResponseStatus(403)
    const t = createTranslator(await localization())
    return { forbidden: true, title: t("common.pages.forbidden.title") }
  }
}
