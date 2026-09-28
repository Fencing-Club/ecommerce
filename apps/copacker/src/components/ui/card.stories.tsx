import { MoreHorizontal } from "lucide-react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card"

const meta = preview.type<{ args: { onAction: () => void } }>().meta({
  component: Card,
  args: { onAction: fn() },
  render: ({ size, onAction }) => (
    <Card size={size} className="max-w-sm">
      <CardHeader>
        <CardTitle>Harbor Tote</CardTitle>
        <CardDescription>Made by Lotus Manufacturing</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="More actions" onClick={() => onAction()}>
            <MoreHorizontal />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p>1,200 units on hand, 400 units on the way.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Reorder</Button>
      </CardFooter>
    </Card>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const card = canvas.getByText("Harbor Tote").closest("[data-slot=card]")
    await expect(card).toHaveAttribute("data-size", "default")
    await expect(canvas.getByText("Made by Lotus Manufacturing")).toBeVisible()
    await expect(canvas.getByText("1,200 units on hand, 400 units on the way.")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    await expect(args.onAction).toHaveBeenCalledOnce()
    await expect(canvas.getByRole("button", { name: "Reorder" })).toBeVisible()
  }
})

export const Small = meta.story({
  args: { size: "sm" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Harbor Tote").closest("[data-slot=card]")).toHaveAttribute("data-size", "sm")
  }
})

export const ContentOnly = meta.story({
  render: () => (
    <Card className="max-w-sm">
      <CardContent>No purchase orders this week.</CardContent>
    </Card>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No purchase orders this week.")).toBeVisible()
  }
})
