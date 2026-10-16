import { setTimeout } from "node:timers/promises"
import { createTranslator } from "use-intl"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { LocalizedError } from "../src/i18n/errors"
import { locales } from "../src/i18n/locales"
import { english } from "../src/i18n/messages"
import { errorResponse, errorTextResponse, failureMessage } from "../src/server/errors"
import { localization, requestLocale, resolveLocalization, withLocalization } from "../src/server/localization"
import { requirementTranslator } from "../src/server/requirements"
import { storeTimeZone } from "../src/server/store-time-zone"
import { pricingText, serverText } from "../src/server/text"

describe("server localization", () => {
  it("keeps English and UTC for background work without assigning a request language", async () => {
    expect(await requestLocale()).toBeUndefined()
    expect(await localization()).toMatchObject({ locale: "en", timeZone: "UTC" })
    expect((await serverText())("overview.due.overdue")).toBe("Past due")
    expect((await pricingText())("priceFirst")).toBe("Add a price before volume pricing")
    expect(await storeTimeZone({ timeZone: null })).toBe("UTC")
    expect(await storeTimeZone({ timeZone: "Asia/Tokyo" })).toBe("Asia/Tokyo")
  })

  it("does no localization work for a request that does not need it", () => {
    const resolve = vi.fn<typeof localization>()
    expect(withLocalization(resolve, () => 204)).toBe(204)
    expect(resolve).not.toHaveBeenCalled()
  })

  it("prefers a valid saved language and safely resolves browser fallbacks and time zones", async () => {
    expect(
      await resolveLocalization({ preferredLocale: "ur", acceptLanguage: "de", timeZone: "Asia/Karachi" })
    ).toMatchObject({ locale: "ur", timeZone: "Asia/Karachi" })
    expect(
      await resolveLocalization({ preferredLocale: "invalid", acceptLanguage: "es-ES", timeZone: "bad/zone" })
    ).toMatchObject({ locale: "es-MX", timeZone: "UTC" })
    expect(await resolveLocalization({ acceptLanguage: "unsupported" })).toMatchObject({
      locale: "en",
      timeZone: "UTC"
    })
  })

  it.each(locales)("isolates overlapping %s translations and dates across asynchronous work", async (locale) => {
    const selected = await resolveLocalization({
      preferredLocale: locale,
      acceptLanguage: null,
      timeZone: "Asia/Tokyo"
    })
    const other = await resolveLocalization({
      preferredLocale: locale === "ur" ? "de" : "ur",
      acceptLanguage: null,
      timeZone: "America/Los_Angeles"
    })
    await Promise.all(
      [selected, other].map(async (config) => {
        const resolve = vi.fn<typeof localization>(async () => {
          await setTimeout(2)
          return config
        })
        await withLocalization(resolve, async () => {
          const [first, second, text, pricing, requirements] = await Promise.all([
            localization(),
            localization(),
            serverText(),
            pricingText(),
            requirementTranslator()
          ])
          expect(first).toBe(second)
          expect(resolve).toHaveBeenCalledTimes(1)
          await setTimeout(3)
          expect(await requestLocale()).toBe(config.locale)
          expect(await storeTimeZone({ timeZone: null })).toBe(config.timeZone)
          expect(await storeTimeZone({ timeZone: "Europe/Berlin" })).toBe("Europe/Berlin")
          expect(text("overview.due.overdue")).toBe(config.messages.server.overview.due.overdue)
          expect(pricing("priceFirst")).toBe(config.messages.supplier.pricing.priceFirst)
          expect(requirements.requirement({ code: "instruction", text: "User's own words" })).toBe("User's own words")
          expect(requirements.requirement({ code: "bundle", units: 2 })).toBe(
            createTranslator({ ...config, namespace: "shipments.requirements" })("bundle", { count: 2 })
          )
          const nested = vi.fn<typeof localization>()
          expect(await withLocalization(nested, requestLocale)).toBe(config.locale)
          expect(nested).not.toHaveBeenCalled()
        })
      })
    )
    expect(await requestLocale()).toBeUndefined()
  })

  it("translates errors, validation keys and downloads without exposing database failures", async () => {
    const config = await resolveLocalization({ preferredLocale: "fr", acceptLanguage: null })
    await withLocalization(
      async () => config,
      async () => {
        const message = config.messages.errors.requestFailed
        expect(await failureMessage(new LocalizedError("requestFailed"))).toBe(message)
        expect(await failureMessage(new Error("Failed query: secret SQL and values"))).toBe(
          config.messages.errors.saveFailed
        )
        expect(await failureMessage(null)).toBe(message)
        expect(await failureMessage(new Error("Specific problem"))).toBe("Specific problem")
        const invalid = z.object({ name: z.string().min(1, "orders.builder.chooseSupplier") }).safeParse({ name: "" })
        expect(await failureMessage(invalid.error)).toBe(config.messages.orders.builder.chooseSupplier)
        const plain = z.string().min(1, "Plain validation message").safeParse("")
        expect(await failureMessage(plain.error)).toBe(": Plain validation message")
        const response = await errorResponse("requestFailed", 403, { "Cache-Control": "private, no-store" })
        expect(response.status).toBe(403)
        expect(response.headers.get("Cache-Control")).toBe("private, no-store")
        expect(await response.json()).toEqual({ error: message })
        const download = await errorTextResponse("requestFailed", 400)
        expect(download.status).toBe(400)
        expect(await download.text()).toBe(message)
      }
    )
  })

  it("does not leak request configuration after failures or retry a failed lookup", async () => {
    const resolve = vi.fn<typeof localization>(async () => {
      throw new Error("lookup unavailable")
    })
    await withLocalization(resolve, async () => {
      await expect(localization()).rejects.toThrow("lookup unavailable")
      await expect(requestLocale()).rejects.toThrow("lookup unavailable")
      expect(resolve).toHaveBeenCalledTimes(1)
    })
    expect(await localization()).toEqual({ locale: "en", timeZone: "UTC", messages: english })
    expect(await requestLocale()).toBeUndefined()
  })
})
