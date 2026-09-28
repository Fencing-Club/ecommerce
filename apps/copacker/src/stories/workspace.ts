import type { Permissions } from "@/lib/access"

// The signed-in person and their workspaces that stories show, one of each kind.
export const person = { id: "user_story", name: "Alex Rivera", email: "alex@example.com" }

export const workspaces = {
  buyer: { id: "org_buyer", name: "Harbor Goods", kind: "buyer" },
  supplier: { id: "org_supplier", name: "Lotus Manufacturing", kind: "supplier" },
  forwarder: { id: "org_forwarder", name: "Bayline Freight", kind: "forwarder" }
} as const

export type WorkspaceKind = keyof typeof workspaces

export const owner: Permissions = { role: "owner", access: {} }

// A member who opens a few pages without prices, to show what a page hides from them.
export const member: Permissions = {
  role: "member",
  access: { orders: "view", shipments: "view", products: "view", inventory: "view" }
}
