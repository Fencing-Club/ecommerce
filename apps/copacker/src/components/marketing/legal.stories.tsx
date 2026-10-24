import { expect, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Legal, Rows } from "./legal"

// A short policy with the parts the real ones use: a list, subheadings, a link and a table of providers.
const meta = preview.meta({
  title: "Components/Marketing/Legal",
  component: Legal,
  args: {
    title: "Privacy policy",
    updated: "2026-09-27",
    lead: "This policy explains what Copacker collects and how we use it.",
    sections: [
      {
        id: "summary",
        title: "The short version",
        content: (
          <ul>
            <li>We use your information to run Copacker for you.</li>
            <li>
              You can ask for a copy of your information through the <a href="/contact">contact page</a>.
            </li>
          </ul>
        )
      },
      {
        id: "collect",
        title: "What we collect",
        content: (
          <>
            <h3 id="collect-account">Your account</h3>
            <p>Your name, email address, position and company.</p>
          </>
        )
      },
      {
        id: "providers",
        title: "Who helps us run Copacker",
        content: (
          <Rows
            rows={[
              ["WorkOS", "Sign-in"],
              ["Resend", "Email"]
            ]}
          />
        )
      }
    ]
  },
  parameters: { layout: "fullscreen" }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible()
    const updated = canvas.getByText("September 27, 2026")
    await expect(updated.tagName).toBe("TIME")
    await expect(updated).toHaveAttribute("dateTime", "2026-09-27")
    await expect(updated.parentElement).toHaveTextContent("Last updated September 27, 2026")

    // A wide screen keeps the contents beside the text, each linking to its section.
    const [contents] = canvas.getAllByRole("navigation", { name: "Contents" })
    if (!contents) {
      throw new Error("The page has its contents")
    }
    await expect(contents).toBeVisible()
    for (const [name, id] of [
      ["The short version", "summary"],
      ["What we collect", "collect"],
      ["Who helps us run Copacker", "providers"]
    ] as const) {
      await expect(within(contents).getByRole("link", { name })).toHaveAttribute("href", `#${id}`)
      const section = canvas.getByRole("region", { name })
      await expect(section).toHaveAttribute("id", id)
      // The text stays in English in every language.
      await expect(section).toHaveAttribute("lang", "en")
    }
    await expect(canvas.getByRole("heading", { level: 3, name: "Your account" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "contact page" })).toHaveAttribute("href", "/contact")
    await expect(canvas.getByText("WorkOS").tagName).toBe("DT")
    await expect(canvas.getByText("Sign-in").tagName).toBe("DD")
  }
})

// A phone folds the contents above the text, to open when wanted.
export const Phone = meta.story({
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas }) => {
    const toggle = canvas.getByText("Contents", { selector: "summary" })
    const folded = toggle.closest("details")
    if (!folded) {
      throw new Error("The contents fold")
    }
    await expect(folded).not.toHaveAttribute("open")
    await userEvent.click(toggle)
    await expect(folded).toHaveAttribute("open")
    await expect(within(folded).getByRole("link", { name: "What we collect" })).toBeVisible()
  }
})

export const Translated = meta.story({
  globals: { locale: "ur" },
  play: async ({ canvas }) => {
    // The frame is in the reader's language, and the policy itself stays left to right in English.
    await expect(canvas.getByRole("region", { name: "The short version" })).toHaveAttribute("dir", "ltr")
    await expect(canvas.getByText("This policy explains what Copacker collects and how we use it.")).toHaveAttribute(
      "lang",
      "en"
    )
  }
})
