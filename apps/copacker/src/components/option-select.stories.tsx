import { ArrowDownUp } from "lucide-react"
import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Field, FieldLabel } from "@/components/ui/field"
import { chooseOption } from "@/stories/play"
import { OptionSelect, type SelectOption } from "./option-select"

type Sort = "urgency" | "quantity" | "name"
const sorts: SelectOption<Sort>[] = [
  { value: "urgency", label: "Most urgent" },
  { value: "quantity", label: "Largest order" },
  { value: "name", label: "Product name" }
]

// A select of set choices outside a form, which hands back the chosen option's own value.
const meta = preview.meta({
  title: "Components/Forms/Option select",
  component: OptionSelect,
  args: { options: sorts, value: "urgency", onChange: fn(), label: "Sort by" }
})

function Controlled({ onChange, ...props }: React.ComponentProps<typeof OptionSelect>) {
  const [value, setValue] = useState(props.value)
  return (
    <OptionSelect
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

export const Choose = meta.story({
  args: { icon: <ArrowDownUp className="text-muted-foreground" /> },
  render: (args) => <Controlled {...args} />,
  play: async ({ args, canvas }) => {
    const select = canvas.getByRole("combobox", { name: "Sort by" })
    await expect(select).toHaveTextContent("Most urgent")
    await chooseOption(select, "Product name")
    await expect(args.onChange).toHaveBeenCalledWith("name")
    await waitFor(() => expect(select).toHaveTextContent("Product name"))
  }
})

// With nothing chosen, the placeholder shows.
export const Placeholder = meta.story({
  args: { value: null, placeholder: "Choose a sort" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Sort by" })).toHaveTextContent("Choose a sort")
  }
})

// An option can say more about itself in the menu, under its label; the select shows the label alone.
export const Descriptions = meta.story({
  args: {
    options: [
      { value: "urgency", label: "Most urgent", description: "Out of stock first" },
      { value: "quantity", label: "Largest order" },
      { value: "name", label: "Product name" }
    ]
  },
  play: async ({ canvas }) => {
    const select = canvas.getByRole("combobox", { name: "Sort by" })
    await expect(select).toHaveTextContent("Most urgent")
    await expect(select).not.toHaveTextContent("Out of stock first")
    await userEvent.click(select)
    await expect(await screen.findByRole("option", { name: /Most urgent\s*Out of stock first/ })).toBeVisible()
    await userEvent.keyboard("{Escape}")
  }
})

// A visible label names it through `id`, or through `labelledBy`.
export const WithLabel = meta.story({
  args: { label: undefined, id: "sort", size: "sm" },
  render: (args) => (
    <Field className="w-48">
      <FieldLabel htmlFor="sort">Order by</FieldLabel>
      <OptionSelect {...args} className="w-full" />
    </Field>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Order by" })).toHaveTextContent("Most urgent")
  }
})

export const LabelledBy = meta.story({
  args: { label: undefined, labelledBy: "sort-label" },
  render: (args) => (
    <div className="flex items-center gap-2">
      <span id="sort-label">Rows by</span>
      <OptionSelect {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Rows by" })).toBeVisible()
  }
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Sort by" })).toHaveAttribute("data-disabled")
  }
})
