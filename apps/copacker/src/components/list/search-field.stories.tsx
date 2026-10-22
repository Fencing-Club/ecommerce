import { useState } from "react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { SearchField } from "./search-field"

// A list's search box: named for screen readers, with a longer placeholder when there's more to say.
const meta = preview.meta({
  title: "Components/Display/Search field",
  component: SearchField,
  args: { label: "Search orders", placeholder: "Search orders, products, or SKUs", value: "", onChange: fn() }
})

function Controlled({ onChange, ...props }: React.ComponentProps<typeof SearchField>) {
  const [value, setValue] = useState(props.value)
  return (
    <SearchField
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

export const Typing = meta.story({
  render: (args) => <Controlled {...args} />,
  play: async ({ args, canvas }) => {
    const field = canvas.getByRole("searchbox", { name: "Search orders" })
    await expect(field).toHaveAttribute("placeholder", "Search orders, products, or SKUs")
    await userEvent.type(field, "tote")
    await expect(field).toHaveValue("tote")
    await expect(args.onChange).toHaveBeenLastCalledWith("tote")
  }
})

// Without its own placeholder, the label is the placeholder.
export const LabelAsPlaceholder = meta.story({
  args: { label: "Search products", placeholder: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("searchbox", { name: "Search products" })).toHaveAttribute(
      "placeholder",
      "Search products"
    )
  }
})

export const MaxLength = meta.story({
  args: { maxLength: 5 },
  render: (args) => <Controlled {...args} />,
  play: async ({ canvas }) => {
    const field = canvas.getByRole("searchbox")
    await userEvent.type(field, "canvas tote")
    await expect(field).toHaveValue("canva")
  }
})
