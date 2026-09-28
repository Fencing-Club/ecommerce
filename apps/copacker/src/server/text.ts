import { createTranslator, type MessageKeys, type NestedKeyOf } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"
import { english, type Messages } from "@/i18n/messages"
import { englishPricing, type PricingText } from "@/lib/catalog-pricing"

export type ServerKey = MessageKeys<Messages["server"], NestedKeyOf<Messages["server"]>>
// Text the server builds for a page, such as a readiness issue or an Overview label, from the "server" messages.
export type ServerText = (key: ServerKey, values?: Record<string, string | number>) => string

export const serverTextInEnglish: ServerText = createTranslator({
  locale: "en",
  messages: english,
  namespace: "server"
})

// The "server" messages in the request's language. The worker and tests run without a request, so they get English.
export async function serverText(): Promise<ServerText> {
  try {
    return await getTranslations("server")
  } catch {
    return serverTextInEnglish
  }
}

// The "supplier.pricing" messages for a pricing check's problem, in the request's language or else English.
export async function pricingText(): Promise<PricingText> {
  try {
    return await getTranslations("supplier.pricing")
  } catch {
    return englishPricing
  }
}

// The request's language, for a job such as an invitation email to send in it; undefined outside a request.
export async function requestLocale() {
  try {
    return await getLocale()
  } catch {
    return undefined
  }
}
