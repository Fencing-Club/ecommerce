import { useForm } from "react-hook-form"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { ActionForm } from "./action-form"
import { FormInput } from "./form-controls"

const submitted = fn()
function Form() {
  const form = useForm({ defaultValues: { name: "" } })
  return (
    <ActionForm form={form} onSubmit={form.handleSubmit(submitted)} label="Save">
      <FormInput name="name" label="Name" />
    </ActionForm>
  )
}
const meta = preview.meta({
  title: "Components/Forms/Action form",
  component: Form,
  beforeEach: () => {
    submitted.mockClear()
  }
})
export const Edit = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled()
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Harbor Goods")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(submitted).toHaveBeenCalledWith({ name: "Harbor Goods" }, expect.anything())
  }
})
