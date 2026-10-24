import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { AuthShell } from "./auth-shell"
import { CliConsent } from "./cli-consent"

const meta = preview.meta({
  title: "Components/Auth/CLI consent",
  component: CliConsent,
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <AuthShell>
      <CliConsent {...args} />
    </AuthShell>
  ),
  args: { email: "alex@example.com", intent: "example", state: "example" }
})
export const Default = meta.story({
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByRole("heading", { name: "Connect your CLI" })).toBeVisible()
    await expect(canvas.getByText("Signed in as alex@example.com")).toBeVisible()
    const allow = canvas.getByRole("button", { name: "Allow access" })
    await userEvent.tab()
    await expect(allow).toHaveFocus()
    await userEvent.tab()
    await expect(canvas.getByRole("button", { name: "Cancel" })).toHaveFocus()
    await expect(canvasElement.querySelector("form")).toHaveAttribute("method", "post")
    const form = canvasElement.querySelector("form")
    if (!form) {
      throw new Error("Missing approval form")
    }
    let decision: FormDataEntryValue | null = null
    const submit = (event: SubmitEvent) => {
      event.preventDefault()
      decision = new FormData(form, event.submitter).get("decision")
    }
    form.addEventListener("submit", submit)
    try {
      await userEvent.keyboard("{Enter}")
      await expect(decision).toBe("deny")
      await userEvent.click(allow)
      await expect(decision).toBe("allow")
    } finally {
      form.removeEventListener("submit", submit)
    }
  }
})
