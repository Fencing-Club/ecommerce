import { objectKeys } from "ts-extras"
import type { AbstractIntlMessages } from "use-intl"
import auth from "../../messages/en/auth.json"
import common from "../../messages/en/common.json"
import emails from "../../messages/en/emails.json"
import errors from "../../messages/en/errors.json"
import inventory from "../../messages/en/inventory.json"
import legal from "../../messages/en/legal.json"
import marketing from "../../messages/en/marketing.json"
import navigation from "../../messages/en/navigation.json"
import notifications from "../../messages/en/notifications.json"
import onboarding from "../../messages/en/onboarding.json"
import orders from "../../messages/en/orders.json"
import overview from "../../messages/en/overview.json"
import partners from "../../messages/en/partners.json"
import products from "../../messages/en/products.json"
import restock from "../../messages/en/restock.json"
import sales from "../../messages/en/sales.json"
import server from "../../messages/en/server.json"
import settings from "../../messages/en/settings.json"
import shipments from "../../messages/en/shipments.json"
import supplier from "../../messages/en/supplier.json"
import validation from "../../messages/en/validation.json"
import { defaultLocale, type Locale } from "./locales"

// The English messages, one file per area of the app under messages/<locale>/<namespace>.json. Their shape is the
// type every translation is checked against (see global.ts).
export const english = {
  auth,
  common,
  emails,
  errors,
  inventory,
  legal,
  marketing,
  navigation,
  notifications,
  onboarding,
  orders,
  overview,
  partners,
  products,
  restock,
  sales,
  server,
  settings,
  shipments,
  supplier,
  validation
}

export type Messages = typeof english

const namespaces = objectKeys(english)

// A language's messages over the English ones, so a message that isn't translated yet shows in English.
export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === defaultLocale) {
    return english
  }
  const translated = await Promise.all(
    namespaces.map(
      async (namespace) =>
        [
          namespace,
          ((await import(`../../messages/${locale}/${namespace}.json`)) as { default: AbstractIntlMessages }).default
        ] as const
    )
  )
  // A translation has at most the English keys, so the merge has the English shape.
  return merge(english, Object.fromEntries(translated)) as Messages
}

function merge(base: AbstractIntlMessages, over: AbstractIntlMessages): AbstractIntlMessages {
  const result: AbstractIntlMessages = { ...base }
  for (const [key, value] of Object.entries(over)) {
    const fallback = base[key]
    result[key] =
      typeof value === "object" && typeof fallback === "object" ? merge(fallback, value) : (value ?? fallback)
  }
  return result
}
