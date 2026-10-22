import { redirect } from "@tanstack/react-router"
import { isCsrfRequestAllowed } from "@tanstack/react-start"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { AccessError, LocalizedError, NotFoundError } from "../src/i18n/errors"
import { loadMessages } from "../src/i18n/messages"
import { InvalidRequestError, requestInput, requestJson, StatusError } from "../src/server/errors"
import { apiHandlers, appOriginPolicy, fallbackResponse, fileResponse, httpResponse } from "../src/server/http-response"
import { requestLocale, resolveLocalization, withLocalization } from "../src/server/localization"

const request = new Request("https://copacker.example/api/things/1?format=csv", { method: "PATCH" })
const answer = (run: () => Response | Promise<Response>) => httpResponse(request, run)

describe("HTTP boundary", () => {
  it("preserves downloads and cookies while preventing shared caching", async () => {
    const response = await answer(
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
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(await response.text()).toBe("file")
  })
  it("keeps a cache policy the handler chose, such as a product photo's", async () => {
    const response = await answer(
      () => new Response("photo", { headers: { "Cache-Control": "private, max-age=31536000, immutable" } })
    )
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable")
  })
  it("localizes authorization failures within the request", async () => {
    const response = await withLocalization(
      () => resolveLocalization({ preferredLocale: "ur", acceptLanguage: null }),
      () =>
        answer(() => {
          throw new AccessError("forbidden")
        })
    )
    expect(response.status).toBe(403)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(await response.json()).toEqual({ error: (await loadMessages("ur")).errors.forbidden })
    expect(await requestLocale()).toBeUndefined()
  })
  it("answers a StatusError with its status and message", async () => {
    const response = await answer(() => {
      throw new StatusError("packingListUnavailable", 409)
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "The packing list is available once packing is finished" })
  })
  it("answers a refusal with a message for the person with 400", async () => {
    const response = await answer(() => {
      throw new LocalizedError("packingListUnavailable")
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "The packing list is available once packing is finished" })
  })
  it("answers request input that doesn't parse with 400: its body, query or path", async () => {
    const post = (body: string) => new Request("https://copacker.example/api/things", { method: "POST", body })
    const body = await answer(async () =>
      Response.json(requestInput(z.strictObject({ count: z.number() }), await requestJson(post('{"count":"two"}'))))
    )
    expect(body.status).toBe(400)
    expect(await body.json()).toEqual({ error: expect.stringContaining("count:") })
    const malformed = await answer(async () => Response.json(await requestJson(post("{"))))
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toHaveProperty("error")
    const query = await answer(() =>
      Response.json(requestInput(z.enum(["pdf", "xlsx"]), new URL(request.url).searchParams.get("format")))
    )
    expect(query.status).toBe(400)
    const path = await answer(() => Response.json(requestInput(z.uuid(), "abc")))
    expect(path.status).toBe(400)
    const id = "00000000-0000-4000-8000-000000000001"
    expect(await (await answer(() => Response.json(requestInput(z.uuid(), id)))).json()).toBe(id)
  })
  it("logs a parse failure that isn't the request's, such as stored or provider data, and answers 500", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      const stored = await answer(() =>
        Response.json(z.strictObject({ revision: z.number() }).parse({ revision: "1" }))
      )
      expect(stored.status).toBe(500)
      expect(stored.headers.get("Cache-Control")).toBe("private, no-store")
      expect(await stored.json()).toEqual({ error: "Something went wrong. Try again." })
      const provider = await answer(() => Response.json(JSON.parse("<html>")))
      expect(provider.status).toBe(500)
      const line = { event: "api_request_failed", method: "PATCH", path: "/api/things/1" }
      expect(logged.mock.calls.map(([text]) => JSON.parse(String(text)))).toEqual([
        { ...line, error: expect.objectContaining({ name: "ZodError" }) },
        { ...line, error: expect.objectContaining({ name: "SyntaxError" }) }
      ])
    } finally {
      logged.mockRestore()
    }
  })
  it("maps missing records to a private 404 and preserves redirects and unexpected errors", async () => {
    const response = await answer(() => {
      throw new NotFoundError()
    })
    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(await response.json()).toEqual({ error: "Not found" })
    const login = redirect({ href: "/login" })
    await expect(
      answer(() => {
        throw login
      })
    ).rejects.toBe(login)
    await expect(
      answer(() => {
        throw new Error("unrelated")
      })
    ).rejects.toThrow("unrelated")
  })
})

describe("API route handlers", () => {
  it("serves each HTTP method its module exports through the boundary, with the route's params", async () => {
    const handlers = apiHandlers({
      GET: (route: Request, { params }: { params: { id: string } }) => Response.json({ id: params.id, url: route.url }),
      DELETE: () => {
        throw new NotFoundError()
      }
    })
    expect(Object.keys(handlers)).toEqual(["GET", "DELETE"])
    const read = await handlers.GET!({ request, params: { id: "1" } })
    expect(await read.json()).toEqual({ id: "1", url: request.url })
    expect(read.headers.get("Cache-Control")).toBe("private, no-store")
    expect((await handlers.DELETE!({ request, params: { id: "1" } })).status).toBe(404)
  })
})

describe("route fallbacks", () => {
  it("leaves the failures the boundary knows to it, and parse failures for it to log", async () => {
    for (const error of [
      new AccessError("forbidden"),
      new StatusError("packingListUnavailable", 409),
      new NotFoundError(),
      new InvalidRequestError(new SyntaxError("Unexpected end of JSON input")),
      new SyntaxError("Unexpected token '<'"),
      new z.ZodError([]),
      redirect({ href: "/login" })
    ]) {
      await expect(fallbackResponse(error, "labelsNotMade")).rejects.toBe(error)
    }
  })
  it("answers anything else with the route's message", async () => {
    const response = await fallbackResponse(new Error("provider down"), "salesRefreshFailed", 503)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("provider down")
  })
})

describe("file downloads", () => {
  it("names the file with RFC 5987 and keeps it private, unsniffed and sandboxed", async () => {
    const response = fileResponse("a,b\n", { filename: "Bob's (draft) price list*.csv", contentType: "text/csv" })
    expect(Object.fromEntries(response.headers)).toEqual({
      "content-type": "text/csv",
      "content-disposition": "attachment; filename*=UTF-8''Bob%27s%20%28draft%29%20price%20list%2A.csv",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox"
    })
    expect(await response.text()).toBe("a,b\n")
  })
  it("shows a file inline when asked", () => {
    const response = fileResponse(new Uint8Array([1]), {
      filename: "import-source.pdf",
      contentType: "application/pdf",
      disposition: "inline"
    })
    expect(response.headers.get("Content-Disposition")).toBe("inline; filename*=UTF-8''import-source.pdf")
  })
})

describe("app origin", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", "https://copacker.example")
    vi.stubEnv("APP_ALIAS_URLS", "https://alias.example")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // Whether Start's CSRF middleware, with the app's policy, lets the request through.
  async function allowed(request: Request, handlerType: "serverFn" | "router" = "router") {
    const check = {
      request,
      pathname: new URL(request.url).pathname,
      handlerType,
      context: undefined,
      next: () => {
        throw new Error("Not reached")
      }
    }
    return !appOriginPolicy.filter(check) || isCsrfRequestAllowed(appOriginPolicy, check)
  }
  const post = (path: string, headers: Record<string, string> = {}) =>
    new Request(`https://copacker.example${path}`, { method: "POST", headers, body: "{}" })

  it.each([
    ["no origin", {}],
    ["another site", { Origin: "https://foreign.example" }],
    ["a look-alike host", { Origin: "https://copacker.example.evil.test" }],
    ["plain HTTP", { Origin: "http://copacker.example" }],
    ["another site's referer", { Referer: "https://foreign.example/page" }],
    ["a cross-site fetch", { "Sec-Fetch-Site": "cross-site", Origin: "https://copacker.example" }],
    ["a same-site fetch", { "Sec-Fetch-Site": "same-site" }]
  ])("refuses a write from %s", async (_name, headers) => {
    expect(await allowed(post("/api/inventory/refresh", headers))).toBe(false)
    expect(await allowed(post("/api/inventory/locations", headers))).toBe(false)
    expect(await allowed(post("/api/action", headers))).toBe(false)
    expect(await allowed(post("/api/connections/amazon-ads", headers))).toBe(false)
    expect(await allowed(post("/logout", headers))).toBe(false)
    expect(await allowed(post("/_serverFn/abc", headers), "serverFn")).toBe(false)
  })
  it.each([
    ["the app", { Origin: "https://copacker.example" }],
    ["an alias", { Origin: "https://alias.example" }],
    ["the app's referer", { Referer: "https://copacker.example/products" }],
    ["a same-origin fetch", { "Sec-Fetch-Site": "same-origin" }]
  ])("accepts a write from %s", async (_name, headers) => {
    expect(await allowed(post("/api/inventory/refresh", headers))).toBe(true)
    expect(await allowed(post("/logout", headers))).toBe(true)
  })
  it("leaves reads, provider webhooks and one-click unsubscribes to their own checks", async () => {
    const foreign = { Origin: "https://foreign.example" }
    expect(await allowed(new Request("https://copacker.example/api/inventory", { headers: foreign }))).toBe(true)
    expect(await allowed(post("/api/webhooks/ebay", foreign))).toBe(true)
    expect(await allowed(post("/api/mailing-list/unsubscribe?email=a&token=b"))).toBe(true)
    expect(await allowed(post("/api/mailing-list", foreign))).toBe(false)
  })
  it("refuses with a 403 to show the person", async () => {
    const response = await appOriginPolicy.failureResponse()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "Refresh the page and try again" })
  })
  it("exempts only CLI bearer endpoints while keeping browser approval protected", async () => {
    for (const path of ["/api/cli/token", "/api/cli/revoke", "/api/operations/account.show"]) {
      expect(await allowed(post(path))).toBe(true)
    }
    for (const path of ["/api/cli/consent", "/api/cli/token/extra", "/api/action"]) {
      expect(await allowed(post(path))).toBe(false)
    }
    expect(await allowed(post("/api/cli/consent", { Origin: "https://copacker.example" }))).toBe(true)
    expect(await allowed(post("/api/operations/account.show"), "serverFn")).toBe(false)
  })
})
