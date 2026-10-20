import { ChevronDown } from "lucide-react"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"
import { Card, CardContent, CardHeader } from "./card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible"

const meta = preview.meta({
  title: "Foundations/Collapsible",
  component: Collapsible,
  args: { onOpenChange: fn() },
  // A card that opens to show a form, as the shipment actions use it.
  render: (args) => (
    <Collapsible {...args} render={<Card className="max-w-md" />}>
      <CardHeader>
        <CollapsibleTrigger render={<Button variant="ghost" />}>
          Report a problem
          <ChevronDown data-icon="inline-end" />
        </CollapsibleTrigger>
      </CardHeader>
      <CollapsibleContent>
        <CardContent>Tell Bayline Freight what went wrong with this shipment.</CardContent>
      </CollapsibleContent>
    </Collapsible>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("button", { name: "Report a problem" })
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.queryByText(/Tell Bayline Freight/)).not.toBeInTheDocument()

    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await expect(await canvas.findByText(/Tell Bayline Freight/)).toBeVisible()
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true, expect.anything())

    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await waitFor(() => expect(canvas.queryByText(/Tell Bayline Freight/)).not.toBeInTheDocument())
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false, expect.anything())
  }
})

export const Open = meta.story({
  args: { defaultOpen: true },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Report a problem" })
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await expect(trigger).toHaveAttribute("aria-controls", canvas.getByText(/Tell Bayline Freight/).parentElement?.id)
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
  }
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("button", { name: "Report a problem" })
    await expect(trigger).toHaveAttribute("data-disabled")
    trigger.click()
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await expect(args.onOpenChange).not.toHaveBeenCalled()
  }
})
