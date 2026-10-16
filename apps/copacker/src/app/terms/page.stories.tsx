import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { serverStory } from "@/stories/server"
import PageView from "./page"

function TermsPage() {
  return <PageView />
}

const meta = preview.meta({
  title: "Pages/Marketing/Terms",
  ...serverStory(TermsPage),
  parameters: { layout: "fullscreen" }
})

const sections = [
  "The service",
  "Accounts and workspaces",
  "Your responsibilities",
  "Acceptable use",
  "Your data",
  "Other services",
  "AI features",
  "Fees",
  "Availability",
  "Suspension and termination",
  "Disclaimers",
  "Limitation of liability",
  "Changes to these terms",
  "Contact"
]

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible()
    await expect(canvas.getByText("September 27, 2026")).toHaveAttribute("dateTime", "2026-09-27")
    const [contents] = canvas.getAllByRole("navigation", { name: "Contents" })
    if (!contents) {
      throw new Error("The page has its contents")
    }
    const links = within(contents).getAllByRole("link")
    await expect(links.map((link) => link.textContent)).toEqual(sections)
    for (const link of links) {
      const id = link.getAttribute("href")?.slice(1) ?? ""
      await expect(document.getElementById(id)).toHaveAttribute("aria-labelledby", `${id}-title`)
    }
    await expect(canvas.getByRole("region", { name: "Limitation of liability" })).toHaveTextContent("US$100")
    for (const link of canvas.getAllByRole("link", { name: "contact page" })) {
      await expect(link).toHaveAttribute("href", "/contact")
    }
  }
})

// In another language the frame is translated, and the terms stay in English until a lawyer reviews a translation.
export const Translated = meta.story({
  globals: { locale: "de" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).not.toHaveTextContent("Terms of service")
    await expect(canvas.getByRole("region", { name: "The service" })).toHaveAttribute("lang", "en")
  }
})
