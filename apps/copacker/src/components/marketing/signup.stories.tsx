import { delay, http, HttpResponse } from "msw"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Signup } from "./signup"

// What the waitlist's endpoint received.
const received = fn()

// The waitlist as the home page closes on it: on the orange stage.
const meta = preview.meta({
  title: "Components/Marketing/Signup",
  component: Signup,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <section className="dark bg-[#c2410c] px-6 py-24 text-white [color-scheme:dark]">
        <Story />
      </section>
    )
  ]
})

export const Joined = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/mailing-list", async ({ request }) => {
        received(await request.json())
        await delay(150)
        return HttpResponse.json({ ok: true })
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Get early access." })).toBeVisible()
    await userEvent.type(canvas.getByRole("textbox", { name: "Email" }), "alex@example.com")
    await userEvent.click(canvas.getByRole("button", { name: "Join" }))
    await expect(await canvas.findByRole("button", { name: "Joining" })).toBeDisabled()
    // The confirmation takes the form's place, and its focus, so it's read out.
    const done = await canvas.findByText("You’re on the waitlist.")
    await waitFor(() => expect(done).toHaveFocus())
    await expect(canvas.queryByRole("textbox", { name: "Email" })).toBeNull()
    // The hidden field for telling bots apart goes along, empty.
    await expect(received).toHaveBeenCalledOnce()
    await expect(received).toHaveBeenCalledWith({ email: "alex@example.com", website: "" })
  }
})

// The browser checks the address before anything is sent.
export const InvalidEmail = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/mailing-list", async ({ request }) => {
        received(await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  },
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Email" })
    await userEvent.click(canvas.getByRole("button", { name: "Join" }))
    await expect(input).toBeInvalid()
    await userEvent.type(input, "not an address")
    await userEvent.click(canvas.getByRole("button", { name: "Join" }))
    await expect(input).toBeInvalid()
    await new Promise((resolve) => setTimeout(resolve, 200))
    await expect(received).not.toHaveBeenCalled()
    await expect(canvas.getByRole("button", { name: "Join" })).toBeEnabled()
  }
})

// The endpoint's own reason shows under the form, and the field is marked.
export const Rejected = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/mailing-list", () =>
        HttpResponse.json({ error: "Too many signups from this address. Try again later." }, { status: 429 })
      )
    )
  },
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Email" })
    await userEvent.type(input, "alex@example.com")
    await userEvent.click(canvas.getByRole("button", { name: "Join" }))
    await waitFor(() =>
      expect(canvas.getByRole("alert")).toHaveTextContent("Too many signups from this address. Try again later.")
    )
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await expect(input).toHaveAccessibleDescription("Too many signups from this address. Try again later.")
    // It can be sent again.
    await expect(canvas.getByRole("button", { name: "Join" })).toBeEnabled()
  }
})

// Without a reason from the endpoint, it says so in the visitor's words.
export const Failed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.post("/api/mailing-list", () => new HttpResponse("Bad gateway", { status: 502 })))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Email" }), "alex@example.com")
    await userEvent.click(canvas.getByRole("button", { name: "Join" }))
    await waitFor(() =>
      expect(canvas.getByRole("alert")).toHaveTextContent("Couldn’t sign you up. Try again in a moment.")
    )
  }
})
