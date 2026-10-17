import { createTranslator } from "use-intl"
import type { ServerText } from "@/i18n/server-text"
import type { PricingText } from "@/lib/catalog-pricing"
import { localization } from "@/server/localization"

// The "server" messages in the request's language. The worker and tests run without a request, so they get English.
export async function serverText(): Promise<ServerText> {
  return createTranslator({ ...(await localization()), namespace: "server" })
}

// The "supplier.pricing" messages for a pricing check's problem, in the request's language or else English.
export async function pricingText(): Promise<PricingText> {
  return createTranslator({ ...(await localization()), namespace: "supplier.pricing" })
}
