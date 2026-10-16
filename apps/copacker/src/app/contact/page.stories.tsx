import { http, HttpResponse } from "msw"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { serverStory } from "@/stories/server"
import PageView from "./page"

// The contact page (page.tsx): anyone can write in, signed in or not.
function ContactPage() {
  return <PageView />
}

// What the contact endpoint received.
const received = fn()

const meta = preview.meta({
  title: "Pages/Marketing/Contact",
  ...serverStory(ContactPage),
  parameters: { layout: "fullscreen" },
  beforeEach: ({ msw }) => {
    scrollTo({ top: 0 })
    msw.use(
      http.post("/api/contact", async ({ request }) => {
        received(await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Talk to us.")
    await expect(canvas.getByRole("banner")).toHaveClass("dark")
    await expect(
      within(canvas.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Contact" })
    ).toHaveAttribute("href", "/contact")
    await expect(canvas.getByRole("heading", { level: 2, name: "Or see for yourself." })).toBeVisible()
    await expect(canvas.getByRole("navigation", { name: "Company" })).toBeVisible()
  }
})

export const SendMessage = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "A walkthrough" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Alex Rivera")
    await userEvent.type(canvas.getByRole("textbox", { name: "Email" }), "alex@example.com")
    await userEvent.type(canvas.getByRole("textbox", { name: "Message" }), "Could we see a walkthrough for our team?")
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }))
    const sent = await canvas.findByRole("heading", { name: "Message sent." })
    await waitFor(() => expect(sent).toHaveFocus())
    await expect(received).toHaveBeenCalledOnce()
    await expect(received).toHaveBeenCalledWith({
      topic: "A walkthrough",
      name: "Alex Rivera",
      email: "alex@example.com",
      company: "",
      message: "Could we see a walkthrough for our team?",
      website: ""
    })
  }
})
