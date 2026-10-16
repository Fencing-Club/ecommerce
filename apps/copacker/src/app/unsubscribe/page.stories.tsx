import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { serverStory } from "@/stories/server"
import PageView from "./page"

// What the page says: a link that isn't Copacker's, the answer once the button's post comes back, or else the question.
function stateOf(valid: boolean, done: string, failed: string) {
  if (!valid) {
    return "invalid"
  }
  if (done) {
    return "done"
  }
  return failed ? "failed" : "confirm"
}

type Query = Record<string, string | string[] | undefined>

// The unsubscribe page (page.tsx) for a link's query. `signed` stands in for canUnsubscribe: whether the token is
// Copacker's signature of the address.
async function UnsubscribePage({ query, signed }: { query: Query; signed: boolean }) {
  const read = (name: string) => {
    const value = query[name]
    return typeof value === "string" ? value : ""
  }
  const email = read("email")
  const token = read("token")
  const valid = Boolean(email) && signed
  return <PageView email={email} token={token} state={stateOf(valid, read("done"), read("failed"))} />
}

const email = "jordan@example.com"
const token = "c2lnbmVkLWZvci1qb3JkYW4"

const meta = preview.meta({
  title: "Pages/Marketing/Unsubscribe",
  ...serverStory(UnsubscribePage),
  args: { query: { email, token }, signed: true },
  parameters: { layout: "fullscreen" }
})

// From an email's link: it asks before unsubscribing, since mail scanners open links on their own.
export const Confirm = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Unsubscribe from Copacker’s emails?")
    await expect(canvas.getByRole("button", { name: "Unsubscribe" })).toBeVisible()
    await expect(canvasElement.querySelector("input[name=email]")).toHaveValue(email)
    await expect(canvasElement.querySelector("input[name=token]")).toHaveValue(token)
    // The page sits on the paper, so the bar starts light.
    await expect(canvas.getByRole("banner")).toHaveClass("light")
  }
})

export const Done = meta.story({
  args: { query: { email, token, done: "1" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("You’re unsubscribed.")
    await expect(canvas.getByRole("link", { name: "Back to Copacker" })).toHaveAttribute("href", "/")
  }
})

export const Failed = meta.story({
  args: { query: { email, token, failed: "1" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Couldn’t unsubscribe you. Try again in a moment.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Unsubscribe" })).toBeVisible()
  }
})

// A token that isn't Copacker's signature of the address.
export const BadSignature = meta.story({
  args: { signed: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("This link doesn’t work.")
    await expect(canvas.queryByRole("button", { name: "Unsubscribe" })).toBeNull()
  }
})

// A link missing its address, or with it given twice, doesn't work either, even once "done".
export const MissingEmail = meta.story({
  args: { query: { email: [email, email], token, done: "1" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("This link doesn’t work.")
    await expect(canvas.getByText("Open the unsubscribe link in your email again.")).toBeVisible()
  }
})
