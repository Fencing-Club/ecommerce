import { getLocale, getMessages, getTimeZone } from "next-intl/server"
import { notFound } from "next/navigation"
import { NotFoundError } from "@/i18n/errors"
import { withLocalization } from "@/server/localization"

// The remaining Next entry points supply their request configuration to framework-independent business code.
// Keep the existing English fallback for direct invocations without a Next request and failed locale lookups.
export function withRequest<Args extends unknown[], Result>(handler: (...args: Args) => Promise<Result>) {
  return (...args: Args): Promise<Result> =>
    withLocalization(
      async () => {
        try {
          const [locale, messages, timeZone] = await Promise.all([getLocale(), getMessages(), getTimeZone()])
          return { locale, messages, timeZone }
        } catch {
          return undefined
        }
      },
      async () => {
        try {
          return await handler(...args)
        } catch (error) {
          if (error instanceof NotFoundError) {
            notFound()
          }
          throw error
        }
      }
    )
}
