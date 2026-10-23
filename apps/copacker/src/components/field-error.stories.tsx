import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { FieldError } from "./field-error"

const meta = preview.meta({ title: "Components/Forms/Field error" })

// A message written as a full key, as a zod schema writes it, shows in the person's language.
export const FromAKey = meta.story({
  render: () => <FieldError errors={[{ message: "common.errors.generic" }]} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Something went wrong. Try again.")
  }
})

// Text that isn't a key, such as a server's already translated message, shows as it is.
export const PlainText = meta.story({
  render: () => <FieldError>Enter a weight under 50 kg.</FieldError>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Enter a weight under 50 kg.")
  }
})
