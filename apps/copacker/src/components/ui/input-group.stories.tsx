import { Eye, EyeOff, Search, Send } from "lucide-react"
import { useState } from "react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupNumberInput,
  InputGroupText,
  InputGroupTextarea
} from "./input-group"
import { Kbd } from "./kbd"

// The password field's show button: the group's button swaps the input's type.
function Password() {
  const [visible, setVisible] = useState(false)
  return (
    <InputGroup className="max-w-sm">
      <InputGroupInput aria-label="Password" type={visible ? "text" : "password"} defaultValue="harbor-goods" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label="Show password"
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

const meta = preview.type<{ args: { onSearch: (query: string) => void; onSend: () => void } }>().meta({
  title: "Foundations/Input group",
  component: InputGroup,
  args: { onSearch: fn(), onSend: fn() },
  // A search box with an icon before the text and a shortcut after it, as the partners page has.
  render: ({ onSearch }) => (
    <InputGroup className="max-w-sm">
      <InputGroupInput
        aria-label="Search partners"
        placeholder="Search"
        onChange={(event) => onSearch(event.target.value)}
      />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        <Kbd>/</Kbd>
      </InputGroupAddon>
    </InputGroup>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const input = canvas.getByRole("textbox", { name: "Search partners" })
    await expect(input).toHaveAttribute("data-slot", "input-group-control")
    await userEvent.type(input, "Lotus")
    await expect(args.onSearch).toHaveBeenLastCalledWith("Lotus")
    // The addons sit on each side of the input.
    const [start, end] = [...(input.parentElement?.querySelectorAll("[data-slot=input-group-addon]") ?? [])]
    await expect(start).toHaveAttribute("data-align", "inline-start")
    await expect(end).toHaveAttribute("data-align", "inline-end")
    await expect(start?.getBoundingClientRect().left).toBeLessThan(input.getBoundingClientRect().left)
    await expect(end?.getBoundingClientRect().left).toBeGreaterThan(input.getBoundingClientRect().left)
  }
})

export const WithText = meta.story({
  render: () => (
    <InputGroup className="max-w-xs">
      <InputGroupAddon>
        <InputGroupText>$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput aria-label="Unit price" inputMode="decimal" defaultValue="4.20" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>per unit</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Unit price" })
    await userEvent.clear(input)
    await userEvent.type(input, "3.95")
    await expect(input).toHaveValue("3.95")
    await expect(canvas.getByText("$")).toBeVisible()
    await expect(canvas.getByText("per unit")).toBeVisible()
  }
})

export const PasswordToggle = meta.story({
  render: () => <Password />,
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText("Password")
    const toggle = canvas.getByRole("button", { name: "Show password" })
    await expect(input).toHaveAttribute("type", "password")
    await expect(toggle).toHaveAttribute("type", "button")
    await userEvent.click(toggle)
    await expect(input).toHaveAttribute("type", "text")
    await expect(toggle).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(toggle)
    await expect(input).toHaveAttribute("type", "password")
  }
})

// A message box with a toolbar underneath, as comments use it.
export const Textarea = meta.story({
  render: ({ onSend }) => (
    <InputGroup className="max-w-md">
      <InputGroupTextarea aria-label="Comment" placeholder="Write a comment" />
      <InputGroupAddon align="block-end" className="border-t">
        <InputGroupText>Suppliers see comments</InputGroupText>
        <InputGroupButton size="sm" variant="default" className="ms-auto" onClick={onSend}>
          <Send />
          Send
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
  play: async ({ canvas, args }) => {
    const textarea = canvas.getByRole("textbox", { name: "Comment" })
    await userEvent.type(textarea, "Ship the cartons on pallets, please.")
    await expect(textarea).toHaveValue("Ship the cartons on pallets, please.")
    await userEvent.click(canvas.getByRole("button", { name: "Send" }))
    await expect(args.onSend).toHaveBeenCalledOnce()
    const toolbar = canvas.getByText("Suppliers see comments").parentElement
    await expect(toolbar).toHaveAttribute("data-align", "block-end")
    await expect(toolbar?.getBoundingClientRect().top).toBeGreaterThan(textarea.getBoundingClientRect().top)
  }
})

export const BlockStart = meta.story({
  render: () => (
    <InputGroup className="max-w-md">
      <InputGroupAddon align="block-start" className="border-b">
        <InputGroupText>Note to Lotus Manufacturing</InputGroupText>
      </InputGroupAddon>
      <InputGroupTextarea aria-label="Note" />
    </InputGroup>
  ),
  play: async ({ canvas }) => {
    const header = canvas.getByText("Note to Lotus Manufacturing").parentElement
    await expect(header).toHaveAttribute("data-align", "block-start")
    await expect(header?.getBoundingClientRect().top).toBeLessThan(
      canvas.getByRole("textbox", { name: "Note" }).getBoundingClientRect().top
    )
  }
})

export const Invalid = meta.story({
  render: () => (
    <InputGroup className="max-w-sm">
      <InputGroupInput aria-label="Email" aria-invalid defaultValue="alex@" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-sm" aria-label="Send invite">
          <Send />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Email" })).toBeInvalid()
    await expect(canvas.getByRole("button", { name: "Send invite" })).toHaveAttribute("data-size", "icon-sm")
  }
})

// A number with its unit after it, as the packing tables' weights and the restock settings have it: no up and down
// buttons, and the digits lined up.
export const NumberWithUnit = meta.story({
  render: () => (
    <InputGroup className="max-w-40">
      <InputGroupNumberInput aria-label="Gross weight" inputMode="decimal" min={0} step="any" defaultValue={12.5} />
      <InputGroupAddon align="inline-end">
        <InputGroupText>kg</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole("spinbutton", { name: "Gross weight" })
    await expect(input).toHaveAttribute("data-slot", "input-group-control")
    await expect(getComputedStyle(input).appearance).toBe("textfield")
    await expect(getComputedStyle(input).fontVariantNumeric).toBe("tabular-nums")
    await userEvent.clear(input)
    await userEvent.type(input, "14.2")
    await expect(input).toHaveValue(14.2)
  }
})
