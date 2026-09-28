import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../src/app/api/contact/route"

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubEnv("EMAIL_API_KEY", "re_test")
  vi.stubEnv("EMAIL_FROM", "Copacker <hello@copacker.ai>")
  vi.stubEnv("CONTACT_EMAIL", "team@copacker.ai")
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const message = {
  topic: "A walkthrough",
  name: "Ana Diaz",
  email: "Ana@Example.com",
  company: "Ridgeline Goods",
  message: "Could we see how Copacker handles AWD?"
}
const send = (body: unknown, address = "198.51.100.1") =>
  POST(
    new Request("http://localhost/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": address },
      body: JSON.stringify(body)
    })
  )

describe("POST /api/contact", () => {
  it("emails the message to the team, with replies going to the sender", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "email-1" }))
    const response = await send(message)
    expect(response.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe("https://api.resend.com/emails")
    const email = JSON.parse(String(init?.body))
    expect(email.to).toEqual(["team@copacker.ai"])
    expect(email.reply_to).toBe("ana@example.com")
    expect(email.subject).toBe("A walkthrough: Ana Diaz, Ridgeline Goods")
    expect(email.text).toContain("Could we see how Copacker handles AWD?")
    expect(email.text).toContain("Ana Diaz <ana@example.com>")
  })

  it("turns away a message missing what the form requires", async () => {
    const response = await send({ ...message, message: " " }, "198.51.100.2")
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("tells a bot filling the hidden field its message went, without sending it", async () => {
    const response = await send({ ...message, website: "https://spam.example" }, "198.51.100.3")
    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("says so when no one is set to receive messages", async () => {
    vi.stubEnv("CONTACT_EMAIL", "")
    const response = await send(message, "198.51.100.4")
    expect(response.status).toBe(502)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("slows down many messages from one address", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "email-1" }))
    const statuses = []
    for (let i = 0; i < 6; i++) {
      statuses.push((await send(message, "198.51.100.5")).status)
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
  })
})
