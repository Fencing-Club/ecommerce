import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../src/app/api/mailing-list/route"
import { POST as unsubscribe } from "../src/app/api/mailing-list/unsubscribe/route"
import { canUnsubscribe, joinMailingList, unsubscribeLinks } from "../src/server/mailing-list"

const fetchMock = vi.fn<typeof fetch>()

// Answers Resend's API by method and path: the contact lookup, contact changes, segments and sent emails.
type Answer = (init: RequestInit | undefined) => Response
function resend(routes: Record<string, Answer>) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const key = `${init?.method ?? "GET"} ${decodeURIComponent(url.pathname)}`
    const answer = routes[key]
    if (!answer) {
      throw new Error(`Unexpected request: ${key}`)
    }
    return answer(init)
  })
}
const calls = (key: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) => `${init?.method ?? "GET"} ${decodeURIComponent(new URL(String(input)).pathname)}` === key
  )
const missing = () => Response.json({ name: "not_found", message: "Contact not found" }, { status: 404 })

beforeEach(() => {
  vi.stubEnv("EMAIL_API_KEY", "re_test")
  vi.stubEnv("EMAIL_MAILING_LIST_API_KEY", "")
  vi.stubEnv("EMAIL_FROM", "Copacker <hello@copacker.ai>")
  vi.stubEnv("MAILING_LIST_SEGMENT_ID", "segment-1")
  vi.stubEnv("CONTACT_EMAIL", "owner@copacker.ai")
  vi.stubEnv("APP_URL", "https://copacker.ai")
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"))
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const signup = (body: unknown, address = "203.0.113.1", language = "en-US") =>
  POST(
    new Request("http://localhost/api/mailing-list", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": address, "accept-language": language },
      body: JSON.stringify(body)
    })
  )

describe("joinMailingList", () => {
  it("adds a new address as a Resend contact in the list's segment, with the language it signed up in", async () => {
    resend({
      "GET /contacts/ana@example.com": missing,
      "POST /contacts": () => Response.json({ object: "contact", id: "contact-1" }, { status: 201 })
    })
    await expect(joinMailingList("ana@example.com", "es-MX")).resolves.toEqual({ joined: true })
    expect(JSON.parse(String(calls("POST /contacts")[0]?.[1]?.body))).toEqual({
      email: "ana@example.com",
      unsubscribed: false,
      properties: { locale: "es-MX" },
      segments: [{ id: "segment-1" }]
    })
  })

  it("adds a new address without a segment when none is set", async () => {
    vi.stubEnv("MAILING_LIST_SEGMENT_ID", "")
    resend({
      "GET /contacts/ana@example.com": missing,
      "POST /contacts": () => Response.json({ object: "contact", id: "contact-1" }, { status: 201 })
    })
    await joinMailingList("ana@example.com", "en")
    expect(JSON.parse(String(calls("POST /contacts")[0]?.[1]?.body))).toEqual({
      email: "ana@example.com",
      unsubscribed: false,
      properties: { locale: "en" }
    })
  })

  it("leaves an address that's already on the list as it is, apart from its segment", async () => {
    resend({
      "GET /contacts/ana@example.com": () => Response.json({ id: "contact-1", unsubscribed: false }),
      "POST /contacts/ana@example.com/segments/segment-1": () => Response.json({ id: "segment-1" })
    })
    await expect(joinMailingList("ana@example.com", "en")).resolves.toEqual({ joined: false })
    expect(calls("POST /contacts")).toHaveLength(0)
    expect(calls("PATCH /contacts/ana@example.com")).toHaveLength(0)
    expect(calls("POST /contacts/ana@example.com/segments/segment-1")).toHaveLength(1)
  })

  it("subscribes an address that had unsubscribed, in the language it came back in, as joining again", async () => {
    resend({
      "GET /contacts/ana@example.com": () => Response.json({ id: "contact-1", unsubscribed: true }),
      "PATCH /contacts/ana@example.com": () => Response.json({ object: "contact", id: "contact-1" }),
      "POST /contacts/ana@example.com/segments/segment-1": () => Response.json({ id: "segment-1" })
    })
    await expect(joinMailingList("ana@example.com", "fr")).resolves.toEqual({ joined: true })
    expect(JSON.parse(String(calls("PATCH /contacts/ana@example.com")[0]?.[1]?.body))).toEqual({
      unsubscribed: false,
      properties: { locale: "fr" }
    })
  })

  it("uses the mailing list's own key over the one the app sends email with", async () => {
    vi.stubEnv("EMAIL_MAILING_LIST_API_KEY", "re_full")
    resend({
      "GET /contacts/ana@example.com": missing,
      "POST /contacts": () => Response.json({ object: "contact", id: "contact-1" }, { status: 201 })
    })
    await joinMailingList("ana@example.com", "en")
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer re_full")
  })

  it("counts an address another signup just added as already on the list", async () => {
    resend({
      "GET /contacts/ana@example.com": missing,
      "POST /contacts": () =>
        Response.json({ name: "validation_error", message: "Contact already exists." }, { status: 422 })
    })
    await expect(joinMailingList("ana@example.com", "en")).resolves.toEqual({ joined: false })
  })

  it("fails when Resend refuses the signup", async () => {
    resend({ "GET /contacts/ana@example.com": () => Response.json({ message: "Too many" }, { status: 429 }) })
    await expect(joinMailingList("ana@example.com", "en")).rejects.toThrow("(429)")
  })
})

describe("POST /api/mailing-list", () => {
  it("signs up a valid address, lowercased, in the page's language, and welcomes it in that language", async () => {
    resend({
      "GET /contacts/ana@example.com": missing,
      "POST /contacts": () => Response.json({ object: "contact", id: "contact-1" }, { status: 201 }),
      "POST /emails": () => Response.json({ id: "email-1" })
    })
    const response = await signup({ email: " Ana@Example.com " }, "203.0.113.2", "de-DE,de;q=0.9")
    expect(response.status).toBe(200)
    expect(JSON.parse(String(calls("POST /contacts")[0]?.[1]?.body)).properties).toEqual({ locale: "de" })
    const [sent] = calls("POST /emails")
    const email = JSON.parse(String(sent?.[1]?.body))
    expect(email.to).toEqual(["ana@example.com"])
    expect(email.subject).toBe("Sie stehen auf der Copacker-Warteliste")
    expect(email.reply_to).toBe("owner@copacker.ai")
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    expect(email.headers["List-Unsubscribe"]).toBe(`<${unsubscribeLinks("ana@example.com").oneClick}>`)
    expect(email.html).toContain(unsubscribeLinks("ana@example.com").page.replaceAll("&", "&amp;"))
    expect(new Headers(sent?.[1]?.headers).get("idempotency-key")).toMatch(/^waitlist-welcome:/)
  })

  it("doesn't welcome an address that was already on the list", async () => {
    resend({
      "GET /contacts/ana@example.com": () => Response.json({ id: "contact-1", unsubscribed: false }),
      "POST /contacts/ana@example.com/segments/segment-1": () => Response.json({ id: "segment-1" })
    })
    expect((await signup({ email: "ana@example.com" }, "203.0.113.7")).status).toBe(200)
    expect(calls("POST /emails")).toHaveLength(0)
  })

  it("keeps the signup when the welcome email can't be sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    resend({
      "GET /contacts/ana@example.com": missing,
      "POST /contacts": () => Response.json({ object: "contact", id: "contact-1" }, { status: 201 }),
      "POST /emails": () => Response.json({ message: "Down" }, { status: 500 })
    })
    expect((await signup({ email: "ana@example.com" }, "203.0.113.8")).status).toBe(200)
  })

  it("turns away an address that isn't one", async () => {
    const response = await signup({ email: "not an email" }, "203.0.113.3")
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("tells a bot filling the hidden field it's on the list without adding it", async () => {
    const response = await signup({ email: "bot@example.com", website: "https://spam.example" }, "203.0.113.4")
    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("slows down many signups from one address", async () => {
    resend({
      "GET /contacts/person0@example.com": () => Response.json({ unsubscribed: false }),
      "GET /contacts/person1@example.com": () => Response.json({ unsubscribed: false }),
      "GET /contacts/person2@example.com": () => Response.json({ unsubscribed: false }),
      "GET /contacts/person3@example.com": () => Response.json({ unsubscribed: false }),
      "GET /contacts/person4@example.com": () => Response.json({ unsubscribed: false }),
      ...Object.fromEntries(
        [0, 1, 2, 3, 4].map((i) => [
          `POST /contacts/person${i}@example.com/segments/segment-1`,
          () => Response.json({ id: "segment-1" })
        ])
      )
    })
    const statuses = []
    for (let i = 0; i < 6; i++) {
      statuses.push((await signup({ email: `person${i}@example.com` }, "203.0.113.5")).status)
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
  })

  it("says so when the list can't take the signup", async () => {
    resend({ "GET /contacts/ana@example.com": () => Response.json({ message: "Down" }, { status: 500 }) })
    const response = await signup({ email: "ana@example.com" }, "203.0.113.6")
    expect(response.status).toBe(502)
  })
})

describe("POST /api/mailing-list/unsubscribe", () => {
  const post = (url: string, form?: Record<string, string>) =>
    unsubscribe(
      new Request(url, {
        method: "POST",
        ...(form ? { body: new URLSearchParams(form) } : { body: "List-Unsubscribe=One-Click" }),
        headers: { "content-type": "application/x-www-form-urlencoded" }
      })
    )

  it("takes the address off the list from a mail app's one-click unsubscribe", async () => {
    resend({ "PATCH /contacts/ana@example.com": () => Response.json({ object: "contact", id: "contact-1" }) })
    const response = await post(unsubscribeLinks("ana@example.com").oneClick)
    expect(response.status).toBe(200)
    expect(JSON.parse(String(calls("PATCH /contacts/ana@example.com")[0]?.[1]?.body))).toEqual({ unsubscribed: true })
  })

  it("sends the page's button back to the page, saying it's done", async () => {
    resend({ "PATCH /contacts/ana@example.com": () => Response.json({ object: "contact", id: "contact-1" }) })
    const token = new URL(unsubscribeLinks("ana@example.com").page).searchParams.get("token") ?? ""
    const response = await post("https://copacker.ai/api/mailing-list/unsubscribe", {
      email: "ana@example.com",
      token,
      from: "page"
    })
    expect(response.status).toBe(303)
    expect(new URL(response.headers.get("location") ?? "").searchParams.get("done")).toBe("1")
  })

  it("refuses a link whose signature isn't the address's own", async () => {
    const response = await post("https://copacker.ai/api/mailing-list/unsubscribe?email=ana%40example.com&token=forged")
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("signs each address differently", () => {
    const token = new URL(unsubscribeLinks("ana@example.com").page).searchParams.get("token") ?? ""
    expect(canUnsubscribe("ana@example.com", token)).toBe(true)
    expect(canUnsubscribe("bo@example.com", token)).toBe(false)
  })
})
