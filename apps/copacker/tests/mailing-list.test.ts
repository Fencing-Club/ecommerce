import { GenericServerException, UnprocessableEntityException } from "@workos-inc/node"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// WorkOS's waitlist: the entries the environment's default waitlist holds, by address.
const client = vi.hoisted(() => ({
  createWaitlistEntry: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listWaitlistEntries: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteWaitlistEntry: vi.fn<(...args: unknown[]) => Promise<void>>()
}))
vi.mock("../src/server/workos", () => ({ workos: () => ({ userManagement: client }), workosClientId: () => "client" }))

import { POST } from "../src/server/http/api/mailing-list"
import { POST as unsubscribe } from "../src/server/http/api/mailing-list/unsubscribe"
import { canUnsubscribe, joinWaitlist, unsubscribeLinks } from "../src/server/mailing-list"

// A waitlist entry as WorkOS returns it, created now unless it says otherwise.
const entry = (email: string, fields: { state?: string; createdAt?: string } = {}) => ({
  object: "waitlist_entry",
  id: `entry-${email}`,
  email,
  state: fields.state ?? "pending",
  approvedAt: null,
  waitlistId: "waitlist-1",
  createdAt: fields.createdAt ?? new Date().toISOString(),
  updatedAt: new Date().toISOString()
})
const joins = () => client.createWaitlistEntry.mock.calls
const created = () => client.createWaitlistEntry.mockImplementation(async (_list, payload) => entry(email(payload)))
const email = (payload: unknown) =>
  typeof payload === "object" && payload && "email" in payload ? String(payload.email) : ""
const unprocessable = () =>
  new UnprocessableEntityException({ requestID: "req", code: "user_exists", message: "User exists" })

// Resend now only sends email: the requests to send one, and to an address.
const fetchMock = vi.fn<typeof fetch>()
const sent = () => fetchMock.mock.calls.map(([, init]) => ({ ...init, body: JSON.parse(String(init?.body)) }))
const sentTo = (address: string) => sent().filter(({ body }) => body.to.includes(address))

beforeEach(() => {
  vi.stubEnv("EMAIL_API_KEY", "re_test")
  vi.stubEnv("EMAIL_FROM", "Copacker <hello@copacker.ai>")
  vi.stubEnv("CONTACT_EMAIL", "owner@copacker.ai")
  vi.stubEnv("APP_URL", "https://copacker.ai")
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"))
  for (const fn of Object.values(client)) {
    fn.mockReset()
  }
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => Response.json({ id: "email-1" }))
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
      headers: { "content-type": "application/json", "cf-connecting-ip": address, "accept-language": language },
      body: JSON.stringify(body)
    })
  )

describe("joinWaitlist", () => {
  it("adds the address to WorkOS's default waitlist with its language and site, without WorkOS's own email", async () => {
    created()
    await expect(joinWaitlist("ana@example.com", "es-MX")).resolves.toEqual({
      joined: true,
      id: "entry-ana@example.com"
    })
    expect(joins()).toEqual([
      ["default", { email: "ana@example.com", additionalFields: { locale: "es-MX", site: "https://copacker.ai" } }]
    ])
  })

  it("counts an address already on the waitlist as not joining again", async () => {
    client.createWaitlistEntry.mockResolvedValue(
      entry("ana@example.com", { createdAt: new Date(Date.now() - 3_600_000).toISOString() })
    )
    await expect(joinWaitlist("ana@example.com", "en")).resolves.toMatchObject({ joined: false })
  })

  it("doesn't count a denied entry as joining", async () => {
    client.createWaitlistEntry.mockResolvedValue(entry("ana@example.com", { state: "denied" }))
    await expect(joinWaitlist("ana@example.com", "en")).resolves.toMatchObject({ joined: false })
  })

  it("treats an address WorkOS turns away, such as one with an account, as already there", async () => {
    client.createWaitlistEntry.mockRejectedValue(unprocessable())
    await expect(joinWaitlist("ana@example.com", "en")).resolves.toEqual({ joined: false })
  })

  it("fails when WorkOS can't take the signup", async () => {
    client.createWaitlistEntry.mockRejectedValue(new GenericServerException(500, "Down", {}, "req"))
    await expect(joinWaitlist("ana@example.com", "en")).rejects.toThrow("Down")
  })
})

describe("POST /api/mailing-list", () => {
  it("signs up a valid address, lowercased, in the page's language, and welcomes it in that language", async () => {
    created()
    const response = await signup({ email: " Ana@Example.com " }, "203.0.113.2", "de-DE,de;q=0.9")
    expect(response.status).toBe(200)
    expect(joins()[0]?.[1]).toMatchObject({ email: "ana@example.com", additionalFields: { locale: "de" } })
    const [welcome] = sentTo("ana@example.com")
    expect(welcome?.body.subject).toBe("Sie stehen auf der Copacker-Warteliste")
    expect(welcome?.body.reply_to).toBe("owner@copacker.ai")
    expect(welcome?.body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    expect(welcome?.body.headers["List-Unsubscribe"]).toBe(`<${unsubscribeLinks("ana@example.com").oneClick}>`)
    expect(welcome?.body.html).toContain(unsubscribeLinks("ana@example.com").page.replaceAll("&", "&amp;"))
    expect(new Headers(welcome?.headers).get("idempotency-key")).toMatch(/^waitlist-welcome:/)
  })

  it("tells the contact address who joined, in which language, and where to approve them", async () => {
    created()
    expect((await signup({ email: "ana@example.com" }, "203.0.113.9", "es-MX")).status).toBe(200)
    const [notice] = sentTo("owner@copacker.ai")
    expect(notice?.body).toMatchObject({
      subject: "Waitlist signup: ana@example.com",
      text: "ana@example.com joined the waitlist.\nLanguage: Español (México)\nApprove them in WorkOS, under Users, Waitlist.",
      reply_to: "ana@example.com"
    })
    expect(new Headers(notice?.headers).get("idempotency-key")).toMatch(/^waitlist-signup:/)
  })

  it("tells nobody when there's no contact address", async () => {
    vi.stubEnv("CONTACT_EMAIL", "")
    created()
    expect((await signup({ email: "ana@example.com" }, "203.0.113.10")).status).toBe(200)
    // Only the welcome goes out.
    expect(sent()).toHaveLength(1)
    expect(sentTo("ana@example.com")).toHaveLength(1)
  })

  it("doesn't welcome or announce an address that was already on the waitlist", async () => {
    client.createWaitlistEntry.mockResolvedValue(
      entry("ana@example.com", { createdAt: new Date(Date.now() - 3_600_000).toISOString() })
    )
    expect((await signup({ email: "ana@example.com" }, "203.0.113.7")).status).toBe(200)
    expect(sent()).toHaveLength(0)
  })

  it("keeps the signup when its emails can't be sent, and logs both", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    created()
    fetchMock.mockImplementation(async () => Response.json({ message: "Down" }, { status: 500 }))
    expect((await signup({ email: "ana@example.com" }, "203.0.113.8")).status).toBe(200)
    expect(logged.mock.calls.map(([line]) => JSON.parse(String(line)).event).toSorted()).toEqual([
      "waitlist_signup_notice_failed",
      "waitlist_welcome_failed"
    ])
  })

  it("turns away an address that isn't one", async () => {
    const response = await signup({ email: "not an email" }, "203.0.113.3")
    expect(response.status).toBe(400)
    expect(joins()).toHaveLength(0)
  })

  it("tells a bot filling the hidden field it's on the list without adding it", async () => {
    const response = await signup({ email: "bot@example.com", website: "https://spam.example" }, "203.0.113.4")
    expect(response.status).toBe(200)
    expect(joins()).toHaveLength(0)
  })

  it("slows down many signups from one address", async () => {
    created()
    const statuses = []
    for (let i = 0; i < 6; i++) {
      statuses.push((await signup({ email: `person${i}@example.com` }, "203.0.113.5")).status)
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
  })

  it("says so when the waitlist can't take the signup", async () => {
    client.createWaitlistEntry.mockRejectedValue(new GenericServerException(500, "Down", {}, "req"))
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
  // The waitlist holds these entries, across pages.
  const holding = (...emails: string[]) =>
    client.listWaitlistEntries.mockResolvedValue({
      autoPagination: async () => emails.map((address) => entry(address))
    })

  it("deletes the address's entry from a mail app's one-click unsubscribe", async () => {
    holding("bo@example.com", "Ana@Example.com")
    const response = await post(unsubscribeLinks("ana@example.com").oneClick)
    expect(response.status).toBe(200)
    expect(client.deleteWaitlistEntry.mock.calls).toEqual([["entry-Ana@Example.com"]])
  })

  it("counts an address that isn't on the waitlist as already off it", async () => {
    holding("bo@example.com")
    const response = await post(unsubscribeLinks("ana@example.com").oneClick)
    expect(response.status).toBe(200)
    expect(client.deleteWaitlistEntry).not.toHaveBeenCalled()
  })

  it("sends the page's button back to the page, saying it's done", async () => {
    holding("ana@example.com")
    const token = new URL(unsubscribeLinks("ana@example.com").page).searchParams.get("token") ?? ""
    const response = await post("https://copacker.ai/api/mailing-list/unsubscribe", {
      email: "ana@example.com",
      token,
      from: "page"
    })
    expect(response.status).toBe(303)
    expect(new URL(response.headers.get("location") ?? "").searchParams.get("done")).toBe("1")
  })

  it("says so when WorkOS can't delete the entry", async () => {
    client.listWaitlistEntries.mockRejectedValue(new GenericServerException(500, "Down", {}, "req"))
    const response = await post(unsubscribeLinks("ana@example.com").oneClick)
    expect(response.status).toBe(502)
  })

  it("refuses a link whose signature isn't the address's own", async () => {
    const response = await post("https://copacker.ai/api/mailing-list/unsubscribe?email=ana%40example.com&token=forged")
    expect(response.status).toBe(400)
    expect(client.listWaitlistEntries).not.toHaveBeenCalled()
  })

  it("signs each address differently", () => {
    const token = new URL(unsubscribeLinks("ana@example.com").page).searchParams.get("token") ?? ""
    expect(canUnsubscribe("ana@example.com", token)).toBe(true)
    expect(canUnsubscribe("bo@example.com", token)).toBe(false)
  })
})
