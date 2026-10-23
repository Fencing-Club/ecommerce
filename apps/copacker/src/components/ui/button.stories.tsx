import { Link } from "@tanstack/react-router"
import { Plus, Trash2 } from "lucide-react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"

const variants = ["default", "outline", "secondary", "ghost", "destructive", "ghost-destructive", "link"] as const
const sizes = ["xs", "sm", "default", "lg"] as const
const iconSizes = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const

const meta = preview.meta({
  title: "Foundations/Button",
  component: Button,
  args: { children: "Create purchase order", onClick: fn() }
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const button = canvas.getByRole("button", { name: "Create purchase order" })
    await expect(button).toHaveAttribute("data-slot", "button")
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledOnce()
  }
})

export const Variants = meta.story({
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      {variants.map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
  play: async ({ canvas, args }) => {
    for (const variant of variants) {
      await userEvent.click(canvas.getByRole("button", { name: variant }))
    }
    await expect(args.onClick).toHaveBeenCalledTimes(variants.length)
    // Each variant looks different from the default.
    const primary = canvas.getByRole("button", { name: "default" }).className
    for (const variant of variants.filter((variant) => variant !== "default")) {
      await expect(canvas.getByRole("button", { name: variant }).className).not.toBe(primary)
    }
  }
})

export const Sizes = meta.story({
  render: (args) => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {sizes.map((size) => (
          <Button key={size} {...args} size={size}>
            {size}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {iconSizes.map((size) => (
          <Button key={size} {...args} size={size} variant="outline" aria-label={`Add product (${size})`}>
            <Plus />
          </Button>
        ))}
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    const heights = sizes.map((size) => canvas.getByRole("button", { name: size }).getBoundingClientRect().height)
    // Each size is taller than the one before.
    for (let index = 1; index < heights.length; index++) {
      await expect(heights[index]).toBeGreaterThan(heights[index - 1] ?? 0)
    }
    for (const size of iconSizes) {
      const button = canvas.getByRole("button", { name: `Add product (${size})` })
      const { width, height } = button.getBoundingClientRect()
      await expect(width).toBe(height)
    }
  }
})

export const WithIcons = meta.story({
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      <Button {...args}>
        <Plus data-icon="inline-start" />
        Add product
      </Button>
      <Button {...args} variant="destructive">
        Delete draft
        <Trash2 data-icon="inline-end" />
      </Button>
    </div>
  ),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Delete draft" }))
    await expect(args.onClick).toHaveBeenCalledOnce()
    await expect(canvas.getByRole("button", { name: "Add product" }).querySelector("svg")).toBeInTheDocument()
  }
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    const button = canvas.getByRole("button", { name: "Create purchase order" })
    await expect(button).toBeDisabled()
    button.click()
    await expect(args.onClick).not.toHaveBeenCalled()
  }
})

export const Invalid = meta.story({
  args: { "aria-invalid": true, variant: "outline" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button")).toHaveAttribute("aria-invalid", "true")
  }
})

// 44px to touch on a phone, the kit's 34px from the small breakpoint up.
function ResponsiveButtons(args: React.ComponentProps<typeof Button>) {
  return (
    <div className="flex items-center gap-2">
      <Button {...args} size="responsive">
        Edit
      </Button>
      <Button {...args} size="icon-responsive" variant="outline" aria-label="Remove">
        <Trash2 />
      </Button>
    </div>
  )
}

export const Responsive = meta.story({
  render: (args) => <ResponsiveButtons {...args} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Edit" }).getBoundingClientRect().height).toBe(34)
    const remove = canvas.getByRole("button", { name: "Remove" }).getBoundingClientRect()
    await expect([remove.width, remove.height]).toEqual([34, 34])
  }
})

export const ResponsiveOnAPhone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  render: (args) => <ResponsiveButtons {...args} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Edit" }).getBoundingClientRect().height).toBe(44)
    const remove = canvas.getByRole("button", { name: "Remove" }).getBoundingClientRect()
    await expect([remove.width, remove.height]).toEqual([44, 44])
  }
})

// Quiet beside other actions until pointed at, then red: a remove or disconnect. It stays red while the confirmation it
// opened is showing.
export const GhostDestructive = meta.story({
  args: { variant: "ghost-destructive" },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Button {...args}>Disconnect</Button>
      <Button {...args} aria-expanded aria-haspopup="dialog">
        Remove
      </Button>
    </div>
  ),
  play: async ({ canvas, args }) => {
    const resting = canvas.getByRole("button", { name: "Disconnect" })
    await expect(canvas.getByRole("button", { name: "Remove" })).toHaveAttribute("aria-expanded")
    await userEvent.click(resting)
    await expect(args.onClick).toHaveBeenCalledOnce()
  }
})

// A link styled as a button, as the page headers use it.
export const AsLink = meta.story({
  render: () => (
    <Button nativeButton={false} render={<Link to="/orders/new" />}>
      <Plus data-icon="inline-start" />
      Create purchase order
    </Button>
  ),
  play: async ({ canvas }) => {
    const link = canvas.getByRole("button", { name: "Create purchase order" })
    await expect(link.tagName).toBe("A")
    await expect(link).toHaveAttribute("href", "/orders/new")
  }
})
