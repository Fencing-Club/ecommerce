import { CheckIcon } from "lucide-react"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "./avatar"

// A tiny image that loads without the network.
const photo = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#4f7cac"/></svg>'
)}`

const sizes = ["sm", "default", "lg"] as const

const meta = preview.meta({
  title: "Foundations/Avatar",
  component: Avatar,
  render: ({ size }) => (
    <Avatar size={size}>
      <AvatarImage src={photo} alt="Alex Rivera" />
      <AvatarFallback>AR</AvatarFallback>
    </Avatar>
  )
})

export const WithImage = meta.story({
  play: async ({ canvas }) => {
    const image = await canvas.findByRole("img", { name: "Alex Rivera" })
    await expect(image).toHaveAttribute("src", photo)
    await expect(canvas.queryByText("AR")).not.toBeInTheDocument()
  }
})

// Initials show while there's no picture, or when it fails to load.
export const Fallback = meta.story({
  render: () => (
    <div className="flex gap-2">
      <Avatar>
        <AvatarFallback>JK</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="data:image/png;base64,broken" alt="Sam Park" />
        <AvatarFallback>SP</AvatarFallback>
      </Avatar>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("JK")).toBeVisible()
    await expect(await canvas.findByText("SP")).toBeVisible()
    await expect(canvas.queryByRole("img", { name: "Sam Park" })).not.toBeInTheDocument()
  }
})

export const Sizes = meta.story({
  render: () => (
    <div className="flex items-center gap-2">
      {sizes.map((size) => (
        <Avatar key={size} size={size}>
          <AvatarFallback>{size}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const widths = sizes.map((size) => canvas.getByText(size).getBoundingClientRect().width)
    await expect(widths[0]).toBeLessThan(widths[1] ?? 0)
    await expect(widths[1]).toBeLessThan(widths[2] ?? 0)
  }
})

export const WithBadge = meta.story({
  render: () => (
    <Avatar size="lg">
      <AvatarFallback>AR</AvatarFallback>
      <AvatarBadge aria-label="Verified">
        <CheckIcon />
      </AvatarBadge>
    </Avatar>
  ),
  play: async ({ canvas }) => {
    const badge = canvas.getByLabelText("Verified")
    await expect(badge).toHaveAttribute("data-slot", "avatar-badge")
    await expect(badge.closest("[data-slot=avatar]")).toHaveAttribute("data-size", "lg")
  }
})

// A team's faces, with a count for the rest.
export const Group = meta.story({
  render: () => (
    <AvatarGroup>
      <Avatar>
        <AvatarImage src={photo} alt="Alex Rivera" />
        <AvatarFallback>AR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>JK</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>SP</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+4</AvatarGroupCount>
    </AvatarGroup>
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("img", { name: "Alex Rivera" })).toBeVisible()
    await expect(canvas.getByText("+4")).toHaveAttribute("data-slot", "avatar-group-count")
    const group = canvas.getByText("+4").closest("[data-slot=avatar-group]")
    await expect(group?.querySelectorAll("[data-slot=avatar]")).toHaveLength(3)
  }
})
