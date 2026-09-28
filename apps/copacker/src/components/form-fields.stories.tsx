import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { SelectField } from "./form-fields"

const meta = preview.meta({
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
    onChange: fn()
  },
  decorators: [(Story) => <div className="max-w-xs">{Story()}</div>]
})

export const Optional = meta.story({
  play: async ({ canvas, args }) => {
    const select = canvas.getByRole("combobox", { name: "Payment terms" })
    await expect(select).toHaveTextContent("Choose terms")
    await userEvent.click(select)
    await expect(await screen.findByRole("option", { name: "Net 60" })).toHaveAttribute("aria-disabled", "true")
    await userEvent.click(screen.getByRole("option", { name: "Net 30" }))
    await expect(args.onChange).toHaveBeenCalledWith({ target: { value: "net30" } })
    await expect(select).toHaveTextContent("Net 30")
    // An optional field's placeholder is a choice too, which empties it.
    await userEvent.click(select)
    await userEvent.click(await screen.findByRole("option", { name: "Choose terms" }))
    await expect(args.onChange).toHaveBeenLastCalledWith({ target: { value: "" } })
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
    await userEvent.click(canvas.getByRole("combobox", { name: "Payment terms" }))
    await userEvent.click(await screen.findByRole("option", { name: "Net 30" }))
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
