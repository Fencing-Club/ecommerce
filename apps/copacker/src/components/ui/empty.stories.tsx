import { FileText } from "lucide-react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./empty"

const meta = preview.type<{ args: { onAction: () => void } }>().meta({
  component: Empty,
  args: { onAction: fn() },
  render: ({ onAction }) => (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileText />
        </EmptyMedia>
        <EmptyTitle>No purchase orders yet</EmptyTitle>
        <EmptyDescription>Create one to order stock from a supplier.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => onAction()}>Create purchase order</Button>
      </EmptyContent>
    </Empty>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText("No purchase orders yet")).toHaveAttribute("data-slot", "empty-title")
    await expect(canvas.getByText("Create one to order stock from a supplier.")).toBeVisible()
    const media = canvas.getByText("No purchase orders yet").parentElement?.querySelector("[data-slot=empty-icon]")
    await expect(media).toHaveAttribute("data-variant", "icon")
    await userEvent.click(canvas.getByRole("button", { name: "Create purchase order" }))
    await expect(args.onAction).toHaveBeenCalledOnce()
  }
})

// Title and description alone, as the error pages show them.
export const TextOnly = meta.story({
  render: () => (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <FileText className="size-10" />
        </EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>
          Check the address and try again, or go to <a href="/overview">Overview</a>.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Page not found")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/overview")
    await expect(
      canvas.getByText("Page not found").parentElement?.querySelector("[data-slot=empty-icon]")
    ).toHaveAttribute("data-variant", "default")
  }
})
