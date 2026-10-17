import { ChevronDown, Download } from "lucide-react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"
import { ButtonGroup, ButtonGroupSeparator } from "./button-group"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./popover"

const meta = preview.meta({
  component: ButtonGroup,
  args: { "aria-label": "Download actions" }
})

export const SplitButton = meta.story({
  render: (args) => (
    <ButtonGroup {...args}>
      <Button onClick={fn()}>
        <Download />
        Download
      </Button>
      <ButtonGroupSeparator className="bg-primary/60" />
      <Popover>
        <PopoverTrigger render={<Button size="icon" aria-label="Download settings" />}>
          <ChevronDown />
        </PopoverTrigger>
        <PopoverContent align="end">
          <PopoverTitle>Download settings</PopoverTitle>
          <Button variant="outline">A4</Button>
        </PopoverContent>
      </Popover>
    </ButtonGroup>
  ),
  play: async ({ canvas, canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body)
    const group = canvas.getByRole("group", { name: "Download actions" })
    const download = within(group).getByRole("button", { name: /^Download$/ })
    const settings = within(group).getByRole("button", { name: "Download settings" })
    await userEvent.click(download)
    await userEvent.tab()
    await expect(settings).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(settings).toHaveFocus())
  }
})
