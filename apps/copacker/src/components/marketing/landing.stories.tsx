import { http, HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { pressEscapeIn } from "@/stories/fixtures/marketing"
import { Landing } from "./landing"

// What the waitlist's endpoint received.
const joined = fn()

const meta = preview.meta({
  component: Landing,
  parameters: { layout: "fullscreen" },
  beforeEach: ({ msw }) => {
    scrollTo({ top: 0 })
    msw.use(
      http.post("/api/mailing-list", async ({ request }) => {
        joined(await request.json())
        return HttpResponse.json({ ok: true })
      }),
      // The film itself isn't loaded: its request answers with nothing.
      http.get("https://media.copacker.ai/*", () => new HttpResponse(null, { status: 204 }))
    )
  }
})

export const Default = meta.story({
  play: async ({ canvas, canvasElement }) => {
    // One main landmark: the product shot's picture of the app has none of its own.
    const main = within(canvas.getByRole("main"))
    await expect(main.getByRole("heading", { level: 1 })).toHaveTextContent("Restocking, handled.")
    await expect(main.getByText(/^Copacker forecasts your inventory/)).toBeVisible()
    // Every call to join links to the waitlist at the foot of the page.
    for (const button of canvas.getAllByRole("button", { name: "Join the waitlist" })) {
      await expect(button).toHaveAttribute("href", "/#waitlist")
    }
    await expect(
      canvas.getByText(/^Copacker’s Restock page: two products from Shenzhen Metalworks/)
    ).toBeInTheDocument()

    // The sections the nav bar and footer link to, in order.
    const ids = Array.from(canvasElement.querySelectorAll("main section[id]"), (section) => section.id)
    await expect(ids).toEqual(["forecast", "handoffs", "agents", "faq", "waitlist"])
    await expect(main.getByRole("heading", { level: 2, name: "Know when to reorder." })).toBeVisible()
    await expect(main.getByRole("heading", { level: 2, name: "Built for AI agents." })).toBeVisible()
    await expect(main.getByRole("heading", { level: 3, name: "Works with any agent." })).toBeVisible()
    await expect(main.getByRole("heading", { level: 2, name: "Get early access." })).toBeVisible()
    // The interactive pieces are there: the forecast, the trip's steps and the film.
    await expect(main.getByRole("slider", { name: "Lead time" })).toBeInTheDocument()
    await expect(main.getByRole("navigation", { name: "Steps" })).toBeInTheDocument()
    // The hero's buttons rise in after the words.
    await waitFor(() => expect(main.getByRole("button", { name: /Watch the video/ })).toBeVisible(), {
      timeout: 3000
    })
    // The hero's field of points and the trip's world each draw on a canvas.
    await expect(canvasElement.querySelectorAll("canvas")).toHaveLength(2)
  }
})

export const Faq = meta.story({
  play: async ({ canvas }) => {
    const faq = within(canvas.getByRole("region", { name: "Questions" }))
    const questions = faq.getAllByRole("button")
    await expect(questions).toHaveLength(11)
    // All closed to start, with the answers still in the page for find in page.
    for (const question of questions) {
      await expect(question).toHaveAttribute("aria-expanded", "false")
    }
    const cost = faq.getByRole("button", { name: "What does Copacker cost?" })
    const mcp = faq.getByRole("button", { name: "What’s MCP?" })
    await userEvent.click(cost)
    await expect(cost).toHaveAttribute("aria-expanded", "true")
    await expect(await faq.findByText(/^Nothing during early access/)).toBeVisible()
    // Several can be open at once.
    await userEvent.click(mcp)
    await expect(await faq.findByText(/^The Model Context Protocol/)).toBeVisible()
    await expect(cost).toHaveAttribute("aria-expanded", "true")
    await userEvent.click(cost)
    await waitFor(() => expect(cost).toHaveAttribute("aria-expanded", "false"))
  }
})

export const Waitlist = meta.story({
  play: async ({ canvas }) => {
    const waitlist = within(canvas.getByRole("region", { name: "Get early access." }))
    await userEvent.type(waitlist.getByRole("textbox", { name: "Email" }), "alex@example.com")
    await userEvent.click(waitlist.getByRole("button", { name: "Join" }))
    await expect(await waitlist.findByText("You’re on the waitlist.")).toBeVisible()
    await expect(joined).toHaveBeenCalledWith({ email: "alex@example.com", website: "" })
  }
})

export const Film = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(within(canvas.getByRole("main")).getByRole("button", { name: /Watch the video/ }))
    // The dialog loads on first use, which Storybook compiles then: slow on a busy machine.
    const dialog = await screen.findByRole("dialog", { name: "Copacker: Restocking, handled" }, { timeout: 15000 })
    await waitFor(() => expect(dialog).toBeVisible())
    await pressEscapeIn(dialog)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// A phone: the section links move to the footer, and the page reads top to bottom.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Main")).not.toBeVisible()
    await expect(within(canvas.getByRole("main")).getByRole("heading", { level: 1 })).toBeVisible()
    await expect(canvas.getByRole("navigation", { name: "Product" })).toBeInTheDocument()
  }
})
