import { redirect } from "@tanstack/react-router"
import { describe, expect, it } from "vitest"
import { AccessError, NotFoundError } from "../src/i18n/errors"
import { loadMessages } from "../src/i18n/messages"
import { httpResponse } from "../src/server/http-response"
import { requestLocale, resolveLocalization, withLocalization } from "../src/server/localization"

describe("HTTP boundary", () => {
  it("preserves downloads and cookies while preventing shared caching", async () => {
    const response = await httpResponse(
      () =>
        new Response("file", {
          status: 206,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Range": "bytes 0-3/4",
            "Set-Cookie": "workspace=second"
          }
        })
    )
    expect(response.status).toBe(206)
    expect(response.headers.get("Content-Range")).toBe("bytes 0-3/4")
    expect(response.headers.getSetCookie()).toEqual(["workspace=second"])
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(await response.text()).toBe("file")
  })
  it("localizes authorization failures within the request", async () => {
    const response = await withLocalization(
      () => resolveLocalization({ preferredLocale: "ur", acceptLanguage: null }),
      () =>
        httpResponse(() => {
          throw new AccessError("forbidden")
        })
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: (await loadMessages("ur")).errors.forbidden })
    expect(await requestLocale()).toBeUndefined()
  })
  it("maps missing records to a private 404 and preserves redirects and unexpected errors", async () => {
    const response = await httpResponse(() => {
      throw new NotFoundError()
    })
    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    const login = redirect({ href: "/login" })
    await expect(
      httpResponse(() => {
        throw login
      })
    ).rejects.toBe(login)
    await expect(
      httpResponse(() => {
        throw new Error("unrelated")
      })
    ).rejects.toThrow("unrelated")
  })
})
