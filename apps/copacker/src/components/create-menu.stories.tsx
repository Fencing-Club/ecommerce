import { expect, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import type { Permissions } from "@/lib/access"
import { CreateMenu } from "./create-menu"

const meta = preview.meta({
  component: CreateMenu,
  args: { kind: "buyer" }
})

async function items() {
  const menu = await screen.findByRole("menu")
  return within(menu).getAllByRole("menuitem")
}

export const Buyer = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Create" }))
    const links = await items()
    await expect(links.map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["Purchase order", "/orders/new"],
      ["Import purchase order", "/orders/import"],
      ["Supplier", "/partners?add=supplier"],
      ["Forwarder", "/partners?add=forwarder"]
    ])
  }
})

export const Supplier = meta.story({
  args: { kind: "supplier" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Create" }))
    await expect((await items()).map((item) => item.textContent)).toEqual(["Product", "Catalog", "Import products"])
  }
})

// Each action needs Edit on its page: a member who edits purchase orders but only views partners.
const ordersEditor: Permissions = { role: "member", access: { orders: "edit", partners: "view" } }
export const OnlyWhatTheyCanEdit = meta.story({
  parameters: { permissions: ordersEditor },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Create" }))
    await expect((await items()).map((item) => item.textContent)).toEqual(["Purchase order", "Import purchase order"])
  }
})

// A forwarder creates nothing, so there's no button.
export const Forwarder = meta.story({
  args: { kind: "forwarder" },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create" })).toBeNull()
  }
})

const viewer: Permissions = { role: "member", access: { orders: "view", partners: "view" } }
export const NothingToCreate = meta.story({
  parameters: { permissions: viewer },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create" })).toBeNull()
  }
})
