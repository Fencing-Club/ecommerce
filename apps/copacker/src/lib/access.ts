import { z } from "zod"

// Who can do what in a workspace. Its owner, who made it, and its admins can do everything, including managing the team
// and the workspace's settings. Members open only the pages they're given, each to view or to edit, and see prices and
// costs only when they're given that too. The server checks this on every page and request; the sidebar, the header's
// search and the pages hide only what someone can't use.
export const roles = ["owner", "admin", "member"] as const
export type Role = (typeof roles)[number]

// The sidebar's pages, by their paths. Settings isn't one: everyone keeps their profile there and sees the team.
export const areas = [
  "overview",
  "sales",
  "products",
  "restock",
  "orders",
  "shipments",
  "partners",
  "customers",
  "inventory",
  "catalogs"
] as const
export type Area = (typeof areas)[number]

// What a member can be given: their pages, and "prices", seeing what things cost and sell for and the totals made of
// them.
export type Grant = Area | "prices"

export const accessLevels = ["view", "edit"] as const
export type AccessLevel = (typeof accessLevels)[number]

// A member's pages and what they can do on each, and "prices" when they see money. A page that isn't listed is one they
// can't open.
export const accessSchema = z.partialRecord(z.enum([...areas, "prices"]), z.enum(accessLevels))
export type Access = z.infer<typeof accessSchema>

// Pages with nothing to change, which members only view: the Overviews, a buyer's sales orders, and Restock, whose
// purchase orders are made with Purchase orders access.
export const viewOnlyAreas: ReadonlySet<Area> = new Set(["overview", "sales", "restock"])

// Pages that are about money, which only members who see prices can open: the Overviews and a supplier's catalogs.
export const moneyAreas: ReadonlySet<Area> = new Set(["overview", "catalogs"])

// Whether changing a page means setting prices, so that only members who see prices can edit it: purchase orders, whose
// lines are priced, a supplier's orders, whose changes can propose prices, and a supplier's products.
export function editSetsPrices(kind: string, area: Area) {
  return area === "orders" || (kind === "supplier" && area === "products")
}

// The most a member can have on a page, given whether they see prices: nothing, view or edit.
export function highestLevel(kind: string, area: Area, prices: boolean): AccessLevel | null {
  if (!prices && moneyAreas.has(area)) {
    return null
  }
  return viewOnlyAreas.has(area) || (!prices && editSetsPrices(kind, area)) ? "view" : "edit"
}

// The page a portal link opens, such as "restock" for "/restock?status=order", or undefined for Settings and anything
// else that isn't one of the pages.
export function pageOf(href: string) {
  const segment = href.split(/[/?#]/)[1]
  return areas.find((area) => area === segment)
}

export type Permissions = { role: Role; access: Access }

export function isAdmin(permissions: Pick<Permissions, "role">) {
  return permissions.role !== "member"
}

// Whether someone can open a page, or with "edit", change what's on it; for "prices", whether they see money.
export function can(permissions: Permissions, grant: Grant, level: AccessLevel = "view") {
  if (isAdmin(permissions)) {
    return true
  }
  const granted = permissions.access[grant]
  return level === "view" ? granted !== undefined : granted === "edit"
}

// Whether a link in the portal leads somewhere the person can open. Settings and anything else that isn't one of the
// pages is open to everyone.
export function canOpen(permissions: Permissions, href: string) {
  const page = pageOf(href)
  return !page || can(permissions, page)
}
