import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Checkbox } from "./checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle
} from "./field"
import { Input } from "./input"
import { Switch } from "./switch"
import { Textarea } from "./textarea"

const meta = preview.meta({
  component: Field,
  render: ({ orientation }) => (
    <Field orientation={orientation} className="max-w-md">
      <FieldLabel htmlFor="lead-time">Lead time</FieldLabel>
      <Input id="lead-time" type="number" defaultValue={60} aria-describedby="lead-time-description" />
      <FieldDescription id="lead-time-description">Days from purchase order to ready.</FieldDescription>
    </Field>
  )
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const input = canvas.getByRole("spinbutton", { name: "Lead time" })
    await expect(input).toHaveAccessibleDescription("Days from purchase order to ready.")
    await expect(input.closest("[data-slot=field]")).toHaveAttribute("data-orientation", "vertical")
    await userEvent.clear(input)
    await userEvent.type(input, "45")
    await expect(input).toHaveValue(45)
  }
})

export const Horizontal = meta.story({
  args: { orientation: "horizontal" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("spinbutton").closest("[data-slot=field]")).toHaveAttribute(
      "data-orientation",
      "horizontal"
    )
  }
})

export const Responsive = meta.story({
  args: { orientation: "responsive" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("spinbutton").closest("[data-slot=field]")).toHaveAttribute(
      "data-orientation",
      "responsive"
    )
  }
})

// A zod message written as a message key shows in the person's language.
export const Invalid = meta.story({
  render: () => (
    <Field data-invalid className="max-w-md">
      <FieldLabel htmlFor="sku">SKU</FieldLabel>
      <Input id="sku" aria-invalid defaultValue="HT 01" />
      <FieldError errors={[{ message: "validation.required" }]} />
    </Field>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "SKU" })).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByRole("alert")).toHaveTextContent("Fill in this field")
  }
})

export const SeveralErrors = meta.story({
  render: () => (
    <Field data-invalid className="max-w-md">
      <FieldLabel htmlFor="sku">SKU</FieldLabel>
      <Input id="sku" aria-invalid />
      <FieldError
        errors={[
          { message: "Use letters, numbers and dashes" },
          { message: "Use letters, numbers and dashes" },
          { message: "Keep it under 40 characters" },
          undefined
        ]}
      />
    </Field>
  ),
  play: async ({ canvas }) => {
    // Repeated messages show once, and other text shows as it is.
    const items = canvas.getAllByRole("listitem")
    await expect(items.map((item) => item.textContent)).toEqual([
      "Use letters, numbers and dashes",
      "Keep it under 40 characters"
    ])
  }
})

export const ErrorText = meta.story({
  render: () => (
    <Field>
      <FieldLabel htmlFor="note">Note</FieldLabel>
      <Textarea id="note" />
      <FieldError>Couldn’t save the note</FieldError>
      <FieldError errors={[]} />
    </Field>
  ),
  play: async ({ canvas }) => {
    // An empty list of errors shows nothing.
    await expect(canvas.getAllByRole("alert")).toHaveLength(1)
    await expect(canvas.getByRole("alert")).toHaveTextContent("Couldn’t save the note")
  }
})

// A settings form: a legend, grouped fields, a choice card and a separator.
export const FieldSetForm = meta.story({
  render: () => (
    <FieldSet className="max-w-md">
      <FieldLegend>Notifications</FieldLegend>
      <FieldDescription>Choose what Copacker emails you about.</FieldDescription>
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox id="shipped" defaultChecked />
          <FieldLabel htmlFor="shipped">Purchase order shipped</FieldLabel>
        </Field>
        <FieldSeparator>Or</FieldSeparator>
        <FieldLabel htmlFor="digest">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Weekly digest</FieldTitle>
              <FieldDescription>Every Monday, with stock that’s running low.</FieldDescription>
            </FieldContent>
            <Switch id="digest" />
          </Field>
        </FieldLabel>
      </FieldGroup>
      <FieldSet>
        <FieldLegend variant="label">Delivery</FieldLegend>
      </FieldSet>
    </FieldSet>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("group", { name: "Notifications" })).toBeVisible()
    await expect(canvas.getByText("Delivery")).toHaveAttribute("data-variant", "label")
    await expect(canvas.getByText("Or")).toHaveAttribute("data-slot", "field-separator-content")

    // The whole choice card is the switch's label.
    const digest = canvas.getByRole("switch")
    await userEvent.click(canvas.getByText("Every Monday, with stock that’s running low."))
    await expect(digest).toHaveAttribute("aria-checked", "true")

    const shipped = canvas.getByRole("checkbox", { name: "Purchase order shipped" })
    await userEvent.click(shipped)
    await expect(shipped).toHaveAttribute("aria-checked", "false")
  }
})
