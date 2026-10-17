import { createFormatter } from "use-intl"
import { LocalizedError } from "../../../src/i18n/errors"
import { direction } from "../../../src/i18n/locales"
import { failureMessage } from "../../../src/server/errors"
import { localization, requestLocale } from "../../../src/server/localization"
import { requirementTranslator } from "../../../src/server/requirements"
import { storeTimeZone } from "../../../src/server/store-time-zone"
import { pricingText, serverText } from "../../../src/server/text"

export async function localizationProbe() {
  const [config, locale, failure, pricing, text, requirements, timeZone] = await Promise.all([
    localization(),
    requestLocale(),
    failureMessage(new LocalizedError("requestFailed")),
    pricingText(),
    serverText(),
    requirementTranslator(),
    storeTimeZone({ timeZone: null })
  ])
  return Response.json({
    locale,
    direction: direction(config.locale),
    timeZone,
    failure,
    pricing: pricing("priceFirst"),
    // A locale-specific list and a calendar date test the runtime's ICU data as well as the translated catalog.
    requirement: requirements.requirement({ code: "bundle", units: 2 }),
    date: createFormatter(config).dateTime(new Date("2026-10-15T01:30:00Z"), { dateStyle: "full" }),
    label: text("overview.due.overdue")
  })
}
