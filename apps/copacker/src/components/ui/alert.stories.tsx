import { CircleAlert, Info } from "lucide-react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert"
import { Button } from "./button"

const meta = preview.type<{ args: { onAction: () => void } }>().meta({
  component: Alert,
  args: { onAction: fn() },
  render: ({ variant }) => (
    <Alert variant={variant}>
      <Info />
      <AlertTitle>Stock is running low</AlertTitle>
      <AlertDescription>Lotus Manufacturing needs 14 days to make more of the Harbor Tote.</AlertDescription>
    </Alert>
  )
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const alert = canvas.getByRole("alert")
    await expect(alert).toHaveTextContent("Stock is running low")
    await expect(alert).toHaveTextContent("Lotus Manufacturing needs 14 days")
    await expect(alert.querySelector("svg")).toBeInTheDocument()
  }
})

export const Destructive = meta.story({
  args: { variant: "destructive" },
  render: ({ variant }) => (
    <Alert variant={variant}>
      <CircleAlert />
      <AlertTitle>Couldn’t send the purchase order</AlertTitle>
      <AlertDescription>
        <p>Lotus Manufacturing has no email address.</p>
        <p>
          Add one on the <a href="/partners">Partners</a> page, then send it again.
        </p>
      </AlertDescription>
    </Alert>
  ),
  play: async ({ canvas }) => {
    const alert = canvas.getByRole("alert")
    await expect(alert.className).toContain("text-destructive")
    await expect(canvas.getByRole("link", { name: "Partners" })).toHaveAttribute("href", "/partners")
  }
})

export const TitleOnly = meta.story({
  render: () => (
    <Alert>
      <AlertTitle>Prices are hidden from members</AlertTitle>
    </Alert>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Prices are hidden from members")
  }
})

export const WithAction = meta.story({
  render: ({ onAction }) => (
    <Alert>
      <Info />
      <AlertTitle>A new catalog is ready</AlertTitle>
      <AlertDescription>Lotus Manufacturing changed 3 prices.</AlertDescription>
      <AlertAction>
        <Button size="xs" variant="outline" onClick={() => onAction()}>
          Review
        </Button>
      </AlertAction>
    </Alert>
  ),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Review" }))
    await expect(args.onAction).toHaveBeenCalledOnce()
  }
})
