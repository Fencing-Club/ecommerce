import { expect, fn, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { AmazonConnect } from "./amazon-connect"

const submitted = fn<(marketplace: FormDataEntryValue | null) => void>()
const meta = preview.meta({
  component: AmazonConnect,
  args: { children: "Connect Amazon" },
  beforeEach: () => {
    const submit = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement) {
        event.preventDefault()
        submitted(new FormData(event.target).get("marketplace"))
      }
    }
    window.addEventListener("submit", submit)
    return () => window.removeEventListener("submit", submit)
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect Amazon" }))
    const dialog = await screen.findByRole("dialog", { name: "Connect Amazon" })
    await expect(within(dialog).getByRole("combobox", { name: "Marketplace" })).toHaveTextContent("United States")
    await expect(within(dialog).queryByLabelText(/token/i)).toBeNull()
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue to Amazon" }))
    await expect(submitted).toHaveBeenCalledWith("US")
  }
})

export const Canada = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect Amazon" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Marketplace" }))
    await userEvent.click(await screen.findByRole("option", { name: "Canada" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue to Amazon" }))
    await expect(submitted).toHaveBeenCalledWith("CA")
  }
})
