import { InputGroup, InputGroupAddon, InputGroupText } from "@buildkitgg/shadcn-baseui-kit"
import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { InputGroupNumberInput, NumberInput } from "./number-input"

const meta = preview.meta({ title: "Components/Forms/Number input" })

export const Default = meta.story({
  render: () => <NumberInput aria-label="Units" defaultValue={240} className="max-w-32" />,
  play: async ({ canvas }) => {
    const input = canvas.getByRole("spinbutton", { name: "Units" })
    await userEvent.clear(input)
    await userEvent.type(input, "420")
    await expect(input).toHaveValue(420)
  }
})

// A weight with its unit after it.
export const InAGroup = meta.story({
  render: () => (
    <InputGroup className="max-w-40">
      <InputGroupNumberInput aria-label="Weight" defaultValue={23.4} />
      <InputGroupAddon align="inline-end">
        <InputGroupText>kg</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("spinbutton", { name: "Weight" })).toHaveValue(23.4)
    await expect(canvas.getByText("kg")).toBeVisible()
  }
})
