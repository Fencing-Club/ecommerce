import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxValue,
  useComboboxAnchor
} from "./combobox"

const suppliers = ["Lotus Manufacturing", "Northwind Textiles", "Cedar Works", "Maple Supply"]

type Customer = { id: string; name: string }

const customers: Customer[] = [
  { id: "c1", name: "Harbor Goods" },
  { id: "c2", name: "Juniper Home" },
  { id: "c3", name: "Maple & Pine" }
]

const partners = [
  { value: "Suppliers", items: ["Lotus Manufacturing", "Northwind Textiles"] },
  { value: "Forwarders", items: ["Bayline Freight"] }
]

// The chips field the catalog editor uses to pick which customers see a catalog.
function CustomerChips({ onValueChange }: { onValueChange: (value: Customer[], details: unknown) => void }) {
  const anchor = useComboboxAnchor()
  return (
    <Combobox
      items={customers}
      multiple
      defaultValue={[customers[0]]}
      itemToStringLabel={(customer: Customer) => customer.name}
      isItemEqualToValue={(item: Customer, value: Customer) => item.id === value.id}
      onValueChange={onValueChange}
    >
      <ComboboxChips ref={anchor} className="max-w-md">
        <ComboboxValue>
          {(value: Customer[]) => (
            <>
              {value.map((customer) => (
                <ComboboxChip key={customer.id}>{customer.name}</ComboboxChip>
              ))}
              <ComboboxChipsInput placeholder={value.length ? "" : "Add customers"} aria-label="Add customers" />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No customers found</ComboboxEmpty>
        <ComboboxList>
          {(customer: Customer) => (
            <ComboboxItem key={customer.id} value={customer}>
              {customer.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

const meta = preview
  .type<{ args: { onValueChange: (value: unknown, details: unknown) => void; disabled?: boolean } }>()
  .meta({
    args: { onValueChange: fn() },
    render: ({ onValueChange, disabled }) => (
      <Combobox items={suppliers} onValueChange={onValueChange}>
        <ComboboxInput placeholder="Choose a supplier" aria-label="Supplier" disabled={disabled} showClear />
        <ComboboxContent>
          <ComboboxEmpty>No suppliers found</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )
  })

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const input = canvas.getByRole("combobox", { name: "Supplier" })
    await expect(input).toHaveAttribute("placeholder", "Choose a supplier")
    await userEvent.click(input)
    const listbox = await screen.findByRole("listbox")
    await expect(within(listbox).getAllByRole("option")).toHaveLength(suppliers.length)

    // Typing narrows the list.
    await userEvent.type(input, "lot")
    await waitFor(() => expect(within(listbox).getAllByRole("option")).toHaveLength(1))
    await userEvent.click(within(listbox).getByRole("option", { name: "Lotus Manufacturing" }))
    await expect(input).toHaveValue("Lotus Manufacturing")
    await expect(args.onValueChange).toHaveBeenLastCalledWith("Lotus Manufacturing", expect.anything())
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())

    // Clearing empties the field.
    const clear = canvasElementButton(input, "combobox-clear")
    await userEvent.click(clear)
    await expect(input).toHaveValue("")
    await expect(args.onValueChange).toHaveBeenLastCalledWith(null, expect.anything())
  }
})

export const Keyboard = meta.story({
  play: async ({ canvas, args }) => {
    const input = canvas.getByRole("combobox", { name: "Supplier" })
    await userEvent.click(input)
    await userEvent.type(input, "maple")
    const option = await screen.findByRole("option", { name: "Maple Supply" })
    await userEvent.keyboard("{ArrowDown}")
    await waitFor(() => expect(option).toHaveAttribute("data-highlighted"))
    await userEvent.keyboard("{Enter}")
    await expect(input).toHaveValue("Maple Supply")
    await expect(args.onValueChange).toHaveBeenLastCalledWith("Maple Supply", expect.anything())
  }
})

// The popup's trigger button opens the full list, marking the chosen option.
export const Trigger = meta.story({
  render: ({ onValueChange }) => (
    <Combobox items={suppliers} defaultValue="Cedar Works" onValueChange={onValueChange}>
      <ComboboxInput placeholder="Choose a supplier" aria-label="Supplier" />
      <ComboboxContent>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole("combobox", { name: "Supplier" })
    await expect(input).toHaveValue("Cedar Works")
    await userEvent.click(canvasElementButton(input, "input-group-button"))
    const selected = await screen.findByRole("option", { name: "Cedar Works" })
    await expect(selected).toHaveAttribute("aria-selected", "true")
    await expect(selected.querySelector("svg")).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())
  }
})

export const NoMatches = meta.story({
  play: async ({ canvas }) => {
    const input = canvas.getByRole("combobox", { name: "Supplier" })
    await userEvent.click(input)
    await userEvent.type(input, "zzz")
    await waitFor(() => expect(screen.getByText("No suppliers found")).toBeVisible())
    await expect(screen.queryAllByRole("option")).toHaveLength(0)
  }
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    const input = canvas.getByRole("combobox", { name: "Supplier" })
    await expect(input).toBeDisabled()
    await expect(args.onValueChange).not.toHaveBeenCalled()
  }
})

export const Grouped = meta.story({
  render: ({ onValueChange }) => (
    <Combobox items={partners} onValueChange={onValueChange}>
      <ComboboxInput placeholder="Choose a partner" aria-label="Partner" />
      <ComboboxContent>
        <ComboboxEmpty>No partners found</ComboboxEmpty>
        <ComboboxList>
          {(group: (typeof partners)[number], index: number) => (
            <ComboboxGroup key={group.value} items={group.items}>
              {index > 0 && <ComboboxSeparator />}
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  ),
  play: async ({ canvas, args }) => {
    const input = canvas.getByRole("combobox", { name: "Partner" })
    await userEvent.click(input)
    const forwarders = await screen.findByRole("group", { name: "Forwarders" })
    await expect(within(forwarders).getByRole("option", { name: "Bayline Freight" })).toBeInTheDocument()
    await expect(within(screen.getByRole("group", { name: "Suppliers" })).getAllByRole("option")).toHaveLength(2)

    await userEvent.type(input, "bay")
    await waitFor(() => expect(screen.queryByRole("group", { name: "Suppliers" })).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole("option", { name: "Bayline Freight" }))
    await expect(args.onValueChange).toHaveBeenLastCalledWith("Bayline Freight", expect.anything())
  }
})

export const MultipleChips = meta.story({
  render: ({ onValueChange }) => <CustomerChips onValueChange={onValueChange} />,
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText("Harbor Goods")).toHaveAttribute("data-slot", "combobox-chip")
    const input = canvas.getByRole("combobox", { name: "Add customers" })
    await userEvent.click(input)
    await userEvent.click(await screen.findByRole("option", { name: "Juniper Home" }))
    await expect(canvas.getByText("Juniper Home")).toHaveAttribute("data-slot", "combobox-chip")
    await expect(args.onValueChange).toHaveBeenLastCalledWith([customers[0], customers[1]], expect.anything())

    // A chip's remove button takes it back out.
    const harbor = canvas.getByText("Harbor Goods")
    const remove = harbor.querySelector("[data-slot=combobox-chip-remove]")
    if (!(remove instanceof HTMLElement)) {
      throw new Error("The chip has no remove button")
    }
    await userEvent.click(remove)
    await waitFor(() => expect(canvas.queryByText("Harbor Goods")).not.toBeInTheDocument())
    await expect(args.onValueChange).toHaveBeenLastCalledWith([customers[1]], expect.anything())
  }
})

// The button in the input's group with the given slot.
function canvasElementButton(input: HTMLElement, slot: string) {
  const button = input.closest("[data-slot=input-group]")?.querySelector(`[data-slot=${slot}]`)
  if (!(button instanceof HTMLElement)) {
    throw new Error(`No ${slot} beside the input`)
  }
  return button
}
