import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { serverStory } from "@/stories/server"
import PageView from "./page"

function PrivacyPage() {
  return <PageView />
}

const meta = preview.meta({
  title: "Pages/Marketing/Privacy",
  ...serverStory(PrivacyPage),
  parameters: { layout: "fullscreen" }
})

const sections = [
  "The short version",
  "What we collect",
  "How we use it",
  "AI features",
  "Amazon and marketplace data",
  "Who we share it with",
  "Cookies",
  "How long we keep it",
  "Security",
  "Your rights and choices",
  "Children",
  "International transfers",
  "Changes to this policy",
  "Contact"
]

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible()
    await expect(canvas.getByText("September 28, 2026")).toHaveAttribute("dateTime", "2026-09-28")
    // Every section is in the contents, in order, linked to its anchor.
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
    // The providers that run Copacker, and the way to ask about your information.
    const sharing = within(canvas.getByRole("region", { name: "Who we share it with" }))
    await expect(sharing.getByText("WorkOS").tagName).toBe("DT")
    await expect(sharing.getByText("Resend")).toBeVisible()
    for (const link of canvas.getAllByRole("link", { name: "contact page" })) {
      await expect(link).toHaveAttribute("href", "/contact")
    }
    for (const link of canvas.getAllByRole("link", { name: "Cookies" })) {
      await expect(link).toHaveAttribute("href", "#cookies")
    }
  }
})
