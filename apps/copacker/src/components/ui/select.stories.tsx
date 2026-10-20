import { Factory } from "lucide-react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Field, FieldLabel } from "./field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "./select"

const suppliers = [
  { value: "lotus", label: "Lotus Manufacturing" },
  { value: "northwind", label: "Northwind Textiles" },
  { value: "cedar", label: "Cedar Works", disabled: true }
]

// Every option's label, so the trigger shows the chosen one's.
const places = [
  { value: "auto", label: "Automatic" },
  { value: "lotus", label: "Lotus Manufacturing" },
  { value: "northwind", label: "Northwind Textiles" },
  { value: "bayline", label: "Bayline Freight" }
]

type Args = {
  onValueChange: (value: unknown, details: unknown) => void
  size?: "sm" | "default"
  disabled?: boolean
  invalid?: boolean
  defaultValue?: string
}

const meta = preview.type<{ args: Args }>().meta({
  title: "Foundations/Select",
  args: { onValueChange: fn() },
  // A supplier picker as the products page builds one: the trigger shows the chosen label, or a prompt.
  render: ({ onValueChange, size, disabled, invalid, defaultValue }) => (
    <Select items={suppliers} defaultValue={defaultValue ?? null} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger size={size} aria-label="Supplier" aria-invalid={invalid} className="w-56">
        <SelectValue>
          {(value: string | null) => suppliers.find((option) => option.value === value)?.label ?? "Choose a supplier"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {suppliers.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("combobox", { name: "Supplier" })
    await expect(trigger).toHaveTextContent("Choose a supplier")
    await expect(trigger).toHaveAttribute("data-size", "default")
    await expect(trigger).toHaveStyle({ height: "36px" })

    await userEvent.click(trigger)
    const listbox = await screen.findByRole("listbox")
    await expect(within(listbox).getAllByRole("option")).toHaveLength(3)
    await expect(within(listbox).getByRole("option", { name: "Cedar Works" })).toHaveAttribute("aria-disabled", "true")

    await userEvent.click(within(listbox).getByRole("option", { name: "Northwind Textiles" }))
    await expect(args.onValueChange).toHaveBeenLastCalledWith("northwind", expect.anything())
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())
    await expect(trigger).toHaveTextContent("Northwind Textiles")

    // The chosen option is marked the next time the list opens.
    await userEvent.click(trigger)
    await expect(await screen.findByRole("option", { name: "Northwind Textiles" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  }
})

export const Keyboard = meta.story({
  args: { defaultValue: "lotus" },
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("combobox", { name: "Supplier" })
    await expect(trigger).toHaveTextContent("Lotus Manufacturing")
    trigger.focus()
    await userEvent.keyboard("{ArrowDown}")
    const lotus = await screen.findByRole("option", { name: "Lotus Manufacturing" })
    await waitFor(() => expect(lotus).toHaveFocus())
    await userEvent.keyboard("{ArrowDown}")
    await expect(screen.getByRole("option", { name: "Northwind Textiles" })).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    await expect(args.onValueChange).toHaveBeenLastCalledWith("northwind", expect.anything())
    await waitFor(() => expect(trigger).toHaveTextContent("Northwind Textiles"))

    // Escape closes the list without changing the choice.
    await userEvent.click(trigger)
    await screen.findByRole("listbox")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())
    await expect(trigger).toHaveTextContent("Northwind Textiles")
  }
})

export const Small = meta.story({
  args: { size: "sm" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Supplier" })).toHaveAttribute("data-size", "sm")
  }
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("combobox", { name: "Supplier" })
    await expect(trigger).toHaveAttribute("data-disabled")
    await userEvent.click(trigger, { pointerEventsCheck: 0 })
    await expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    await expect(args.onValueChange).not.toHaveBeenCalled()
  }
})

export const Invalid = meta.story({
  args: { invalid: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Supplier" })).toHaveAttribute("aria-invalid", "true")
  }
})

// Grouped options under labels, with an icon in the trigger and a list that doesn't cover it, as the order builder
// and settings forms use it.
export const Grouped = meta.story({
  render: ({ onValueChange }) => (
    <Field className="max-w-xs">
      <FieldLabel htmlFor="partner">Ship from</FieldLabel>
      <Select items={places} defaultValue="auto" onValueChange={onValueChange}>
        <SelectTrigger id="partner" className="w-full">
          <Factory />
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            <SelectItem value="auto" label="Automatic">
              Automatic
            </SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Suppliers</SelectLabel>
            <SelectItem value="lotus">Lotus Manufacturing</SelectItem>
            <SelectItem value="northwind">Northwind Textiles</SelectItem>
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Warehouses</SelectLabel>
            <SelectItem value="bayline">Bayline Freight</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  ),
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("combobox", { name: "Ship from" })
    await expect(trigger).toHaveTextContent("Automatic")
    await userEvent.click(trigger)
    const warehouses = await screen.findByRole("group", { name: "Warehouses" })
    await expect(screen.getByRole("group", { name: "Suppliers" })).toBeInTheDocument()
    await expect(document.querySelector("[data-slot=select-separator]")).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole("listbox").getBoundingClientRect().top).toBeGreaterThanOrEqual(
        trigger.getBoundingClientRect().bottom
      )
    )
    await userEvent.click(within(warehouses).getByRole("option", { name: "Bayline Freight" }))
    await expect(args.onValueChange).toHaveBeenLastCalledWith("bayline", expect.anything())
    await waitFor(() => expect(trigger).toHaveTextContent("Bayline Freight"))
  }
})
