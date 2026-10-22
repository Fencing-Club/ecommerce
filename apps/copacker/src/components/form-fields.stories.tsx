import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { chooseOption, width } from "@/stories/play"
import { SelectField } from "./form-fields"

const meta = preview.meta({
  title: "Components/Forms/Form fields",
  component: SelectField,
  args: {
    label: "Payment terms",
    id: "payment-terms",
    options: [
      { value: "prepaid", label: "Prepaid" },
      { value: "net30", label: "Net 30" },
      { value: "net60", label: "Net 60", disabled: true }
    ],
    placeholder: "Choose terms",
    onValueChange: fn()
  },
  decorators: [width("max-w-xs")]
})

export const Optional = meta.story({
  play: async ({ canvas, args }) => {
    const select = canvas.getByRole("combobox", { name: "Payment terms" })
    await expect(select).toHaveTextContent("Choose terms")
    await userEvent.click(select)
    await expect(await screen.findByRole("option", { name: "Net 60" })).toHaveAttribute("aria-disabled", "true")
    await userEvent.click(screen.getByRole("option", { name: "Net 30" }))
    await expect(args.onValueChange).toHaveBeenCalledWith("net30")
    await expect(select).toHaveTextContent("Net 30")
    // Reopening while the list is still closing would find its options, which no longer take clicks.
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    // An optional field's placeholder is a choice too, which empties it.
    await chooseOption(select, "Choose terms")
    await expect(args.onValueChange).toHaveBeenLastCalledWith("")
    await waitFor(() => expect(select).toHaveTextContent("Choose terms"))
  }
})

export const Required = meta.story({
  args: { required: true, description: "As agreed with your supplier" },
  play: async ({ canvas }) => {
    const select = canvas.getByRole("combobox", { name: /Payment terms/ })
    await expect(canvas.getByText("As agreed with your supplier")).toBeVisible()
    await userEvent.click(select)
    await screen.findByRole("option", { name: "Prepaid" })
    // A required field has no empty choice.
    await expect(screen.queryByRole("option", { name: "Choose terms" })).toBeNull()
    await userEvent.keyboard("{Escape}")
  }
})

// The form's check failed: the field reads as invalid, described by its hint and then its error.
export const Invalid = meta.story({
  args: { required: true, description: "As agreed with your supplier", error: "Choose payment terms" },
  play: async ({ canvas }) => {
    const select = canvas.getByRole("combobox", { name: /Payment terms/ })
    await expect(select).toHaveAttribute("aria-invalid", "true")
    await expect(select).toHaveAccessibleDescription("As agreed with your supplier Choose payment terms")
  }
})

// A value submitted with a plain form.
export const InNativeForm = meta.story({
  args: { name: "terms", defaultValue: "prepaid" },
  render: (args) => (
    <form aria-label="Terms" onSubmit={(event) => event.preventDefault()}>
      <SelectField {...args} />
    </form>
  ),
  play: async ({ canvas }) => {
    const form = canvas.getByRole("form", { name: "Terms" })
    if (!(form instanceof HTMLFormElement)) {
      throw new Error("Expected a form")
    }
    await expect(canvas.getByRole("combobox", { name: "Payment terms" })).toHaveTextContent("Prepaid")
    await expect(new FormData(form).get("terms")).toBe("prepaid")
    await chooseOption(canvas.getByRole("combobox", { name: "Payment terms" }), "Net 30")
    await waitFor(() => expect(new FormData(form).get("terms")).toBe("net30"))
  }
})

export const WithEmptyOption = meta.story({
  args: {
    label: "Forwarder",
    id: "forwarder",
    options: [
      { value: "", label: "None" },
      { value: "bayline", label: "Bayline Freight" }
    ],
    value: ""
  },
  play: async ({ canvas }) => {
    // An empty value shows the empty option rather than the placeholder.
    await expect(canvas.getByRole("combobox", { name: "Forwarder" })).toHaveTextContent("None")
  }
})

export const Disabled = meta.story({
  args: { disabled: true, value: "net30" },
  play: async ({ canvas }) => {
    const select = canvas.getByRole("combobox", { name: "Payment terms" })
    await expect(select).toHaveTextContent("Net 30")
    await expect(select).toHaveAttribute("data-disabled")
  }
})
