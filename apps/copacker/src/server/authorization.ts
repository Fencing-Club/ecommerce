import { AccessError } from "@/i18n/errors"
import type { AccessLevel } from "@/lib/access"
import type { Grant } from "@/lib/access"
import type { Permissions } from "@/lib/access"
import { can, isAdmin } from "@/lib/access"
import { areaLabelKey } from "@/lib/navigation"

type Workspace = { org: { kind: string } }

const kindRequired = { buyer: "buyerWorkspaceRequired", supplier: "supplierWorkspaceRequired" } as const

// The workspace must be a buyer's or a supplier's. Switching workspace in another tab makes any other kind a refused
// request: a 403 from a route, and No access on a page.
export function requireKind(s: Workspace, kind: keyof typeof kindRequired) {
  if (s.org.kind !== kind) {
    throw new AccessError(kindRequired[kind])
  }
}

export function requireBuyer(s: Workspace) {
  requireKind(s, "buyer")
}

export function requireSupplier(s: Workspace) {
  requireKind(s, "supplier")
}

export function requireAdmin(s: Pick<Permissions, "role">) {
  if (!isAdmin(s)) {
    throw new AccessError("adminsOnly")
  }
}

export function requireOwner(s: Pick<Permissions, "role">) {
  if (s.role !== "owner") {
    throw new AccessError("ownerOnly")
  }
}

// Check each operation on the server, including the price grant when it reads or changes money. Navigation and
// parent route guards are presentation concerns and cannot authorize a directly invoked endpoint or server function.
export function requireAccess(s: Permissions & Workspace, grant: Grant, level: AccessLevel = "view") {
  if (!can(s, grant, level)) {
    const page = grant === "prices" ? "prices" : (areaLabelKey(s.org.kind, grant) ?? grant)
    throw new AccessError("askAdminForAccess", { page })
  }
}
