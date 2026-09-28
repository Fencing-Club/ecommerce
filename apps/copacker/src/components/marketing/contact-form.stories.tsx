import { delay, http, HttpResponse } from "msw"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { ContactForm } from "./contact-form"

// What the contact endpoint received.
const received = fn()

const meta = preview.meta({
  component: ContactForm,
  decorators: [
    (Story) => (
      <div className="bg-(--paper) p-6 [--paper:oklch(0.972_0.008_78)]">
        <Story />
      </div>
    )
  ],
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/contact", async ({ request }) => {
        received(await request.json())
        await delay(150)
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

// Types a whole message into the form.
async function fill(canvas: { getByRole: (role: "textbox", options: { name: string }) => HTMLElement }) {
  await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Alex Rivera")
  await userEvent.type(canvas.getByRole("textbox", { name: "Email" }), " Alex@Example.com ")
  await userEvent.type(canvas.getByRole("textbox", { name: "Company" }), "Harbor Goods")
  await userEvent.type(canvas.getByRole("textbox", { name: "Message" }), "Could we see a walkthrough for our team?")
}

export const Validation = meta.story({
  play: async ({ canvas }) => {
    // Early access is chosen to start, from six topics.
    await expect(canvas.getAllByRole("radio")).toHaveLength(6)
    await expect(canvas.getByRole("radio", { name: "Early access" })).toBeChecked()
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }))
    await expect(await canvas.findByText("Enter your name")).toBeVisible()
    await expect(canvas.getByText("Enter a valid email address")).toBeVisible()
    await expect(canvas.getByText("Write your message")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "Name" })).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByRole("textbox", { name: "Name" })).toHaveAccessibleDescription("Enter your name")
    // The company is optional.
    await expect(canvas.getByRole("textbox", { name: "Company" })).toHaveAttribute("aria-invalid", "false")
    await expect(received).not.toHaveBeenCalled()

    // An address that isn't one is still caught once the rest is filled in.
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Alex Rivera")
    await userEvent.type(canvas.getByRole("textbox", { name: "Email" }), "alex at example")
    await userEvent.type(canvas.getByRole("textbox", { name: "Message" }), "Hello")
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }))
    await waitFor(() => expect(canvas.queryByText("Enter your name")).toBeNull())
    await expect(canvas.getByText("Enter a valid email address")).toBeVisible()
    await expect(received).not.toHaveBeenCalled()
  }
})

export const Sent = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "Support" }))
    await expect(canvas.getByRole("radio", { name: "Support" })).toBeChecked()
    await expect(canvas.getByRole("radio", { name: "Early access" })).not.toBeChecked()
    await fill(canvas)
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }))
    await expect(await canvas.findByRole("button", { name: "Sending" })).toBeDisabled()

    // The parcel takes the form's place, and focus moves to what it says.
    const sent = await canvas.findByRole("heading", { name: "Message sent." })
    await waitFor(() => expect(sent).toHaveFocus())
    await expect(canvas.getByText("We’ll write back to alex@example.com.")).toBeVisible()
    // The form stays in its place, hidden, so the card keeps its height.
    await expect(canvas.getByRole("button", { name: "Send message", hidden: true })).not.toBeVisible()
    // The topic goes in English, the address trimmed and lowercased, and the field for bots empty.
    await expect(received).toHaveBeenCalledOnce()
    await expect(received).toHaveBeenCalledWith({
      topic: "Support",
      name: "Alex Rivera",
      email: "alex@example.com",
      company: "Harbor Goods",
      message: "Could we see a walkthrough for our team?",
      website: ""
    })

    // Sending another brings back an empty form, with focus on its first choice.
    await userEvent.click(canvas.getByRole("button", { name: "Send another" }))
    const first = await canvas.findByRole("radio", { name: "Early access" })
    await expect(first).toBeChecked()
    await waitFor(() => expect(first).toHaveFocus())
    await expect(canvas.getByRole("textbox", { name: "Name" })).toHaveValue("")
    await expect(canvas.getByRole("textbox", { name: "Message" })).toHaveValue("")
  }
})

// The endpoint's own reason shows beside the button, and the message stays to send again.
export const Rejected = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/contact", () =>
        HttpResponse.json({ error: "Too many messages. Try again in an hour." }, { status: 429 })
      )
    )
  },
  play: async ({ canvas }) => {
    await fill(canvas)
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Too many messages. Try again in an hour.")
    await expect(canvas.getByRole("textbox", { name: "Message" })).toHaveValue(
      "Could we see a walkthrough for our team?"
    )
    await expect(canvas.getByRole("button", { name: "Send message" })).toBeEnabled()
  }
})

// Without an answer at all, it says so in the visitor's words.
export const Offline = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.post("/api/contact", () => HttpResponse.error()))
  },
  play: async ({ canvas }) => {
    await fill(canvas)
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Couldn’t send your message. Try again in a moment."
    )
  }
})

// On a phone the topics sit one to a row, so a long word such as Partnerschaften stays whole inside its card.
export const PhoneTopics = meta.story({
  globals: { locale: "de", viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const topics = canvas.getAllByRole("radio")
    await expect(topics).toHaveLength(6)
    for (const topic of topics) {
      const card = topic.closest("label")
      if (!card) {
        throw new Error("A topic isn't in its card")
      }
      await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
    }
  }
})
