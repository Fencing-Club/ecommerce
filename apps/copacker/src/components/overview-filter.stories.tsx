import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { expect, screen, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { ChannelFilter } from "./overview-filter"

const meta = preview.meta({
  component: ChannelFilter,
  args: {
    channels: [
      { key: "amazon", label: "Amazon" },
      { key: "shopify:81234", label: "Harbor Warehouse" }
    ],
    value: null
  },
  parameters: { nextjs: { navigation: { pathname: "/overview", query: { period: "last90" } } } }
})

// Choosing a channel keeps the period in the URL.
export const ChooseChannel = meta.story({
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("combobox", { name: "Channel" })
    await expect(trigger).toHaveTextContent("All channels")
    await userEvent.click(trigger)
    // A store with one location of its own reads as Shopify.
    await expect(await screen.findByRole("option", { name: "Shopify" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("option", { name: "Amazon" }))
    await expect(getRouter().push).toHaveBeenCalledWith("/overview?period=last90&channel=amazon")
  }
})

// All channels takes the channel out of the URL and keeps the period.
export const BackToAllChannels = meta.story({
  args: { value: "amazon" },
  parameters: { nextjs: { navigation: { pathname: "/overview", query: { period: "last90", channel: "amazon" } } } },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("combobox", { name: "Channel" })
    await expect(trigger).toHaveTextContent("Amazon")
    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole("option", { name: "All channels" }))
    await expect(getRouter().push).toHaveBeenCalledWith("/overview?period=last90")
  }
})

// With several Shopify locations, each is named.
export const SeveralLocations = meta.story({
  args: {
    channels: [
      { key: "amazon", label: "Amazon" },
      { key: "shopify:81234", label: "Harbor Warehouse" },
      { key: "shopify:81235", label: "Downtown Store" }
    ]
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Channel" }))
    await expect(await screen.findByRole("option", { name: "Shopify: Harbor Warehouse" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("option", { name: "Shopify: Downtown Store" }))
    await expect(getRouter().push).toHaveBeenCalledWith("/overview?period=last90&channel=shopify%3A81235")
  }
})
