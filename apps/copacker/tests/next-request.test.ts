import { beforeEach, expect, it, vi } from "vitest"
import { GET } from "../src/app/api/products/without-supplier/route"
import { NotFoundError } from "../src/i18n/errors"
import { type Locale } from "../src/i18n/locales"
import { loadMessages, type Messages } from "../src/i18n/messages"
import { localization, requestLocale } from "../src/server/localization"
import { withRequest } from "../src/server/next-request"

const intl = vi.hoisted(() => ({
  locale: vi.fn<() => Promise<Locale>>(),
  messages: vi.fn<() => Promise<Messages>>(),
  timeZone: vi.fn<() => Promise<string>>()
}))
vi.mock("next-intl/server", () => ({ getLocale: intl.locale, getMessages: intl.messages, getTimeZone: intl.timeZone }))
vi.mock("../src/server/auth", () => ({
  session: async () => ({ org: { kind: "supplier" } }),
  requirePage: vi.fn<() => void>()
}))

beforeEach(async () => {
  vi.resetAllMocks()
  intl.locale.mockResolvedValue("ur")
  intl.messages.mockResolvedValue(await loadMessages("ur"))
  intl.timeZone.mockResolvedValue("Asia/Karachi")
})

it("preserves an API's status and headers and translates its response using the Next request", async () => {
  const response = await GET()
  expect(response.status).toBe(403)
  expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  expect(await response.json()).toEqual({ error: (await loadMessages("ur")).errors.buyerWorkspaceRequired })
  expect(await requestLocale()).toBeUndefined()
})

it("preserves arguments and shares one lazy lookup across nested entry points", async () => {
  const nested = withRequest(async () => localization())
  const entry = withRequest(async (id: string) => ({ id, first: await localization(), second: await nested() }))
  const result = await entry("row-1")
  expect(result.id).toBe("row-1")
  expect(result.first).toBe(result.second)
  expect(result.first).toMatchObject({ locale: "ur", timeZone: "Asia/Karachi" })
  expect(intl.locale).toHaveBeenCalledTimes(1)
  await withRequest(async () => 204)()
  expect(intl.locale).toHaveBeenCalledTimes(1)
})

it("retains English fallback when invoked without a Next request", async () => {
  intl.locale.mockRejectedValue(new Error("No request"))
  await withRequest(async () => {
    expect(await localization()).toMatchObject({ locale: "en", timeZone: "UTC" })
    expect(await requestLocale()).toBeUndefined()
  })()
})

it("maps a domain lookup failure to Next's not-found boundary", async () => {
  await expect(
    withRequest(async () => {
      throw new NotFoundError()
    })()
  ).rejects.toMatchObject({
    digest: "NEXT_HTTP_ERROR_FALLBACK;404"
  })
  await expect(
    withRequest(async () => {
      throw new Error("unrelated")
    })()
  ).rejects.toThrow("unrelated")
})
