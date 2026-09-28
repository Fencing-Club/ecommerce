import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../src/app/api/mailing-list/route"
import { joinMailingList } from "../src/server/mailing-list"

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubEnv("EMAIL_API_KEY", "re_test")
  vi.stubEnv("MAILING_LIST_SEGMENT_ID", "segment-1")
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const signup = (body: unknown, address = "203.0.113.1") =>
  POST(
    new Request("http://localhost/api/mailing-list", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": address },
      body: JSON.stringify(body)
    })
  )

describe("joinMailingList", () => {
  it("adds the address as a Resend contact in the list's segment", async () => {
    fetchMock.mockResolvedValue(Response.json({ object: "contact", id: "contact-1" }))
    await joinMailingList("ana@example.com")
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe("https://api.resend.com/contacts")
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "ana@example.com",
      unsubscribed: false,
      segments: [{ id: "segment-1" }]
    })
  })

  it("adds the contact without a segment when none is set", async () => {
    vi.stubEnv("MAILING_LIST_SEGMENT_ID", "")
    fetchMock.mockResolvedValue(Response.json({ object: "contact", id: "contact-1" }))
    await joinMailingList("ana@example.com")
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      email: "ana@example.com",
      unsubscribed: false
    })
  })

  it("counts an address that's already a contact as added", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ name: "validation_error", message: "Contact already exists." }, { status: 422 })
    )
    await expect(joinMailingList("ana@example.com")).resolves.toBeUndefined()
  })

  it("fails when Resend refuses the signup", async () => {
    fetchMock.mockResolvedValue(Response.json({ name: "rate_limit_exceeded", message: "Too many" }, { status: 429 }))
    await expect(joinMailingList("ana@example.com")).rejects.toThrow("(429)")
  })
})

describe("POST /api/mailing-list", () => {
  it("signs up a valid address, lowercased", async () => {
    fetchMock.mockResolvedValue(Response.json({ object: "contact", id: "contact-1" }))
    const response = await signup({ email: " Ana@Example.com " }, "203.0.113.2")
    expect(response.status).toBe(200)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).email).toBe("ana@example.com")
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
    fetchMock.mockResolvedValue(Response.json({ object: "contact", id: "contact-1" }))
    const statuses = []
    for (let i = 0; i < 6; i++) {
      statuses.push((await signup({ email: `person${i}@example.com` }, "203.0.113.5")).status)
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
  })

  it("says so when the list can't take the signup", async () => {
    fetchMock.mockResolvedValue(Response.json({ name: "application_error", message: "Down" }, { status: 500 }))
    const response = await signup({ email: "ana@example.com" }, "203.0.113.6")
    expect(response.status).toBe(502)
  })
})
