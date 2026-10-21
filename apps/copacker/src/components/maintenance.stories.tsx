import { http, HttpResponse } from "msw/http"
import { expect, fn, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Maintenance } from "./maintenance"

// How often the page asked whether maintenance is over. It still is, so the page stays rather than reloading.
const asked = fn()

const meta = preview.meta({
  title: "Components/App shell/Maintenance",
  component: Maintenance,
  parameters: { layout: "fullscreen" },
  beforeEach: ({ msw }) => {
    asked.mockClear()
    msw.use(
      http.get("/api/maintenance", () => {
        asked()
        return HttpResponse.json({ active: true })
      })
    )
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("We’ll be back soon")
    await expect(canvas.getByText("Maintenance in progress")).toBeInTheDocument()
    await expect(canvas.getByText("Your data is safe, and this page reloads when we’re back.")).toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: "Copacker" })).toHaveAttribute("href", "/")
    await expect(canvas.getByRole("button", { name: "Contact us" })).toHaveAttribute("href", "/contact")
    // It asks whether Copacker is back.
    await waitFor(() => expect(asked).toHaveBeenCalled())
  }
})

// On the dark stage in either theme.
export const Dark = meta.story({
  globals: { theme: "dark" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-tone=dark]")).toHaveClass("dark")
    await waitFor(() => expect(asked).toHaveBeenCalled())
  }
})

export const Urdu = meta.story({
  globals: { locale: "ur" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("ہم جلد واپس آئیں گے")
    await expect(canvas.getByRole("button", { name: "ہم سے رابطہ کریں" })).toHaveAttribute("href", "/contact")
    await waitFor(() => expect(asked).toHaveBeenCalled())
  }
})
