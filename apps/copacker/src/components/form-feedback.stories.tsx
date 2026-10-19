import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { FormError, SubmitButton } from "./form-feedback"

const meta = preview.meta({ title: "Components/Forms/Form feedback", component: FormError })

export const Errors = meta.story({
  render: () => (
    <div className="flex flex-col gap-3">
      {/* A full message key shows in the person's language; other text shows as it is. */}
      <FormError message="orders.timeline.comment.required" />
      <FormError message={"Line 2 has no SKU\nLine 3 has no quantity"} />
      <FormError />
    </div>
  ),
  play: async ({ canvas }) => {
    const alerts = canvas.getAllByRole("alert")
    await expect(alerts).toHaveLength(2)
    await expect(alerts[0]).toHaveTextContent("Write a comment")
    await expect(alerts[1]).toHaveTextContent("Line 2 has no SKU")
  }
})

export const SubmitButtons = meta.story({
  render: () => (
    <div className="flex gap-2">
      <SubmitButton pending={false}>Save</SubmitButton>
      <SubmitButton pending>Saving</SubmitButton>
      <SubmitButton pending={false} disabled>
        Nothing to save
      </SubmitButton>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled()
    await expect(canvas.getByRole("button", { name: "Saving" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Saving" })).toHaveAttribute("aria-busy", "true")
    await expect(canvas.getByRole("button", { name: "Nothing to save" })).toBeDisabled()
  }
})
