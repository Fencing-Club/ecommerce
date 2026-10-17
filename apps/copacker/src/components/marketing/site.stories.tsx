import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { JoinWaitlist, Site } from "./site"
import { stage } from "./site-styles"

// The frame with a dark stage at the top of the page, as the home and contact pages open.
const meta = preview.meta({
  component: Site,
  args: {
    children: (
      <main id="main-content">
        <section data-tone="dark" className={`${stage} -mt-16 px-6 pt-40 pb-24`}>
          <h1 className="text-5xl font-semibold">Restocking, handled.</h1>
        </section>
      </main>
    )
  },
  parameters: { layout: "fullscreen" }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const nav = within(canvas.getByRole("navigation", { name: "Main" }))
    for (const [name, href] of [
      ["Forecast", "/#forecast"],
      ["Handoffs", "/#handoffs"],
      ["Agents", "/#agents"],
      ["FAQ", "/#faq"],
      ["Contact", "/contact"]
    ] as const) {
      await expect(nav.getByRole("link", { name })).toHaveAttribute("href", href)
    }
    await expect(canvas.getByRole("button", { name: "Join the waitlist" })).toHaveAttribute("href", "/#waitlist")
    // It starts dark, over the stage.
    await expect(canvas.getByRole("banner")).toHaveClass("dark")

    const company = within(canvas.getByRole("navigation", { name: "Company" }))
    await expect(company.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy")
    await expect(company.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms")
    await expect(company.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact")
    const product = within(canvas.getByRole("navigation", { name: "Product" }))
    await expect(product.getAllByRole("link")).toHaveLength(4)
    await expect(canvas.getByText(`© ${new Date().getFullYear()} Copacker`)).toBeVisible()
  }
})

// A page on paper, such as the legal pages, starts the bar light.
export const OnPaper = meta.story({
  args: {
    tone: "light",
    children: (
      <main id="main-content" className="mx-auto max-w-6xl px-6 py-24">
        <h1 className="text-5xl font-semibold">Privacy policy</h1>
      </main>
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("banner")).toHaveClass("light")
    await expect(canvas.getByRole("heading", { name: "Privacy policy" })).toBeVisible()
  }
})

// A phone keeps the call to join and leaves the section links to the footer.
export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Main")).not.toBeVisible()
    await expect(canvas.getByRole("button", { name: "Join the waitlist" })).toBeVisible()
    await expect(canvas.getByRole("navigation", { name: "Product" })).toBeVisible()
  }
})

export const WaitlistButton = meta.story({
  render: () => <JoinWaitlist className="w-fit" />,
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: "Join the waitlist" })
    await expect(button).toHaveAttribute("href", "/#waitlist")
    await expect(button).toHaveClass("w-fit")
  }
})
