import { http, HttpResponse } from "msw/http"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { pressEscapeIn } from "@/stories/fixtures/marketing"
import { Contact } from "./contact"

const meta = preview.meta({
  title: "Components/Marketing/Contact",
  component: Contact,
  parameters: { layout: "fullscreen" },
  beforeEach: ({ msw }) => {
    scrollTo({ top: 0 })
    // The film itself isn't loaded: its request answers with nothing.
    msw.use(http.get("https://media.copacker.ai/*", () => new HttpResponse(null, { status: 204 })))
  }
})

export const Default = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Talk to us.")
    await expect(canvas.getByText(/^Questions about Copacker, a walkthrough for your team/)).toBeVisible()
    // The form sits across the stage's lower edge, over the settled field of points.
    await expect(canvas.getByRole("radio", { name: "Early access" })).toBeChecked()
    await expect(canvas.getByRole("button", { name: "Send message" })).toBeInTheDocument()
    await expect(canvasElement.querySelector("canvas")).toBeInTheDocument()
    // The other ways in.
    const ways = within(canvas.getByRole("region", { name: "Or see for yourself." }))
    await expect(ways.getByRole("heading", { level: 3, name: "Get early access" })).toBeVisible()
    await expect(ways.getByRole("button", { name: "Join the waitlist" })).toHaveAttribute("href", "/#waitlist")
    await expect(ways.getByRole("link", { name: "Questions" })).toHaveAttribute("href", "/#faq")
  }
})

// The film plays from the ways in, on the paper.
export const WatchTheVideo = meta.story({
  play: async ({ canvas }) => {
    const ways = within(canvas.getByRole("region", { name: "Or see for yourself." }))
    const button = ways.getByRole("button", { name: /Watch the video/ })
    await userEvent.click(button)
    // The dialog loads on first use, which Storybook compiles then: slow on a busy machine.
    const dialog = await screen.findByRole("dialog", { name: "Copacker: Restocking, handled" }, { timeout: 15000 })
    await waitFor(() => expect(dialog).toBeVisible())
    await pressEscapeIn(dialog)
    await waitFor(() => expect(button).toHaveFocus())
  }
})

// Translated, the form's topics and checks come in the visitor's language.
export const Translated = meta.story({
  globals: { locale: "es-MX" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("radio", { name: "Acceso anticipado" })).toBeChecked()
    await userEvent.click(canvas.getByRole("button", { name: "Enviar mensaje" }))
    await expect(await canvas.findByText("Ingresa tu nombre")).toBeInTheDocument()
    await expect(canvas.getByText("Escribe tu mensaje")).toBeInTheDocument()
  }
})
