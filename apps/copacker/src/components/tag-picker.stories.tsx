import { useRef, useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { TagPicker } from "./tag-picker"

type Props = Omit<React.ComponentProps<typeof TagPicker>, "inputRef">

// The picker with its parent keeping the tags, as the product dialogs do.
function Controlled({ value: initial, onChange, ...props }: Props) {
  const [value, setValue] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex max-w-md flex-col gap-2">
      <label htmlFor={props.id}>Tags</label>
      <TagPicker
        {...props}
        value={value}
        inputRef={input}
        onChange={(tags) => {
          setValue(tags)
          onChange(tags)
        }}
      />
    </div>
  )
}

const storeTags = ["Bestseller", "Canvas", "Gift", "Holiday", "Linen", "Market", "Natural", "Outdoor", "Summer", "Tote"]

const meta = preview.meta({
  title: "Components/Forms/Tag picker",
  component: Controlled,
  args: { id: "tags", value: [], onChange: fn(), suggestions: storeTags, placeholder: "Add tags" }
})

export const AddTags = meta.story({
  play: async ({ canvas, args }) => {
    const input = canvas.getByLabelText("Tags")
    await expect(input).toHaveAttribute("placeholder", "Add tags")
    // Eight of the store's tags are suggested at first.
    await expect(canvas.getAllByRole("button", { name: /^(?!Remove)/ })).toHaveLength(8)
    // Enter adds what's typed.
    await userEvent.type(input, "Eco{Enter}")
    await expect(args.onChange).toHaveBeenLastCalledWith(["Eco"])
    await expect(input).toHaveValue("")
    await expect(input).not.toHaveAttribute("placeholder")
    // A comma adds each tag before it.
    await userEvent.type(input, "Spring, summer,")
    await expect(args.onChange).toHaveBeenLastCalledWith(["Eco", "Spring", "summer"])
    // A suggestion adds itself, and tags already chosen, whatever their case, aren't suggested.
    await expect(canvas.queryByRole("button", { name: "Summer" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Gift" }))
    await expect(args.onChange).toHaveBeenLastCalledWith(["Eco", "Spring", "summer", "Gift"])
    // Typing narrows the suggestions.
    await userEvent.type(input, "lin")
    await expect(canvas.getByRole("button", { name: "Linen" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Canvas" })).toBeNull()
  }
})

// Clicking a suggestion the typing narrowed to adds the suggestion, not what's typed; so does Tab then Enter.
export const PickFilteredSuggestion = meta.story({
  play: async ({ canvas, args }) => {
    const input = canvas.getByLabelText("Tags")
    await userEvent.type(input, "t")
    await userEvent.click(canvas.getByRole("button", { name: "Tote" }))
    await expect(args.onChange).toHaveBeenCalledOnce()
    await expect(args.onChange).toHaveBeenLastCalledWith(["Tote"])
    await expect(input).toHaveValue("")
    await expect(input).toHaveFocus()
    await userEvent.type(input, "lin")
    await userEvent.tab()
    await expect(canvas.getByRole("button", { name: "Linen" })).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    await expect(args.onChange).toHaveBeenLastCalledWith(["Tote", "Linen"])
    await expect(input).toHaveValue("")
    // Leaving the suggestions for elsewhere still keeps what's typed.
    await userEvent.type(input, "ma")
    await userEvent.tab()
    await expect(canvas.getByRole("button", { name: "Market" })).toHaveFocus()
    await userEvent.tab()
    await expect(args.onChange).toHaveBeenLastCalledWith(["Tote", "Linen", "ma"])
  }
})

export const RemoveTags = meta.story({
  args: { value: ["Canvas", "Gift", "Natural"] },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove Gift" }))
    await expect(args.onChange).toHaveBeenLastCalledWith(["Canvas", "Natural"])
    // Backspace in an empty box removes the last tag.
    await userEvent.click(canvas.getByLabelText("Tags"))
    await userEvent.keyboard("{Backspace}")
    await expect(args.onChange).toHaveBeenLastCalledWith(["Canvas"])
    await expect(canvas.queryByRole("button", { name: "Remove Natural" })).toBeNull()
  }
})

// A tag the store already has isn't added twice, and leaving the box keeps what's typed.
export const NoDuplicates = meta.story({
  args: { value: ["Canvas"] },
  play: async ({ canvas, args, canvasElement }) => {
    const input = canvas.getByLabelText("Tags")
    await userEvent.type(input, "canvas{Enter}")
    await expect(args.onChange).toHaveBeenLastCalledWith(["Canvas"])
    await userEvent.type(input, "Weekend")
    await userEvent.click(canvasElement)
    await expect(args.onChange).toHaveBeenLastCalledWith(["Canvas", "Weekend"])
    await expect(within(canvasElement).getByText("Weekend")).toBeVisible()
  }
})

// Clicking the box's empty space types into it.
export const FocusFromBox = meta.story({
  args: { value: ["Canvas"], suggestions: [] },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText("Tags")
    const box = input.parentElement
    if (!box) {
      throw new Error("The input has no box")
    }
    await userEvent.click(box)
    await expect(input).toHaveFocus()
    await expect(canvas.queryByRole("button", { name: /^(?!Remove)/ })).toBeNull()
  }
})
