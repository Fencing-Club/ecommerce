import { beforeEach, expect, it, vi } from "vitest"

const { resolveLocale, withDatabase } = vi.hoisted(() => ({
  resolveLocale: vi.fn<() => Promise<void>>(),
  withDatabase: vi.fn<(_config: unknown, run: () => Promise<unknown>) => Promise<unknown>>((_config, run) => run())
}))
vi.mock("cloudflare:workers", () => ({ env: { PROBE_MODE: "staging", HYPERDRIVE: { connectionString: "test" } } }))
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: () => undefined }))
vi.mock("@/server/auth-session", () => ({ authentication: async () => ({ user: null }) }))
vi.mock("@/server/localization", () => ({ localization: resolveLocale }))
vi.mock("@/db", () => ({ withDatabase }))

import { portalData, portalLocale } from "../src/portal-data.server"

beforeEach(() => {
  vi.clearAllMocks()
  resolveLocale.mockResolvedValue()
})

it("finishes locale work before taking a domain database connection", async () => {
  const locale = Promise.withResolvers<void>()
  resolveLocale.mockReturnValue(locale.promise)
  const read = vi.fn<() => Promise<string>>().mockResolvedValue("page")
  const pending = portalData(read)
  expect(withDatabase).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
  locale.resolve()
  await expect(pending).resolves.toBe("page")
  expect(withDatabase).toHaveBeenCalledOnce()
  expect(read).toHaveBeenCalledWith(null)
})

it("does not take a domain connection when locale resolution fails", async () => {
  resolveLocale.mockRejectedValueOnce(new Error("Locale connection failed"))
  await expect(portalData(async () => "page")).rejects.toThrow("Locale connection failed")
  expect(withDatabase).not.toHaveBeenCalled()
})

it("resolves the anonymous profile locale without recursively resolving localization", async () => {
  await expect(portalLocale()).resolves.toBeUndefined()
  expect(resolveLocale).not.toHaveBeenCalled()
})
