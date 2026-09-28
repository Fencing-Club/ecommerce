// The mailing list the marketing page signs people up to: contacts in Resend, added to the segment
// MAILING_LIST_SEGMENT_ID names when it's set, so broadcasts can go to just them. Adding contacts takes a full access
// key, EMAIL_MAILING_LIST_API_KEY, since the key the app sends email with should only be able to send; without one, it
// tries that key. Resend treats an address that's already a contact as a validation error, and anyone can sign up, so
// the page says the same thing either way.
export async function joinMailingList(email: string) {
  const key = process.env.EMAIL_MAILING_LIST_API_KEY || process.env.EMAIL_API_KEY
  if (!key) {
    throw new Error("Mailing list is not configured")
  }
  const segment = process.env.MAILING_LIST_SEGMENT_ID
  const response = await fetch("https://api.resend.com/contacts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, unsubscribed: false, ...(segment ? { segments: [{ id: segment }] } : {}) }),
    signal: AbortSignal.timeout(15000)
  })
  if (response.ok) {
    return
  }
  const body: unknown = await response.json().catch(() => null)
  const message = typeof body === "object" && body && "message" in body ? String(body.message) : ""
  if (/already exists/i.test(message)) {
    return
  }
  throw new Error(`Mailing list rejected the signup (${response.status})`)
}
