import { Link } from "@tanstack/react-router"
import { CheckIcon } from "lucide-react"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Badge } from "./badge"

const variants = ["default", "secondary", "destructive", "outline", "ghost", "link"] as const

const meta = preview.meta({
  title: "Foundations/Badge",
  component: Badge,
  args: { children: "Submitted" }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const badge = canvas.getByText("Submitted")
    await expect(badge.tagName).toBe("SPAN")
    await expect(badge).toHaveAttribute("data-slot", "badge")
  }
})

export const Variants = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-2">
      {variants.map((variant) => (
        <Badge key={variant} variant={variant}>
          {variant}
        </Badge>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const classes = variants.map((variant) => canvas.getByText(variant).className)
    // Every variant has its own look.
    await expect(new Set(classes).size).toBe(variants.length)
  }
})

export const WithIcon = meta.story({
  render: () => (
    <Badge variant="secondary">
      <CheckIcon data-icon="inline-start" />
      Received
    </Badge>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Received").querySelector("svg")).toBeInTheDocument()
  }
})

// A badge that links somewhere, rendered as the link itself.
export const AsLink = meta.story({
  render: () => (
    <Badge variant="outline" render={<Link to="/orders" search={{ status: "draft" }} />}>
      3 drafts
    </Badge>
  ),
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: "3 drafts" })
    await expect(link).toHaveAttribute("href", "/orders?status=draft")
    await expect(link).toHaveAttribute("data-slot", "badge")
  }
})
