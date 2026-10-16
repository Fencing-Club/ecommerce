import { AccessError, LocalizedError } from "@/i18n/errors"
import type { AccessLevel } from "@/lib/access"
import type { Grant } from "@/lib/access"
import type { Permissions } from "@/lib/access"
import { can, isAdmin } from "@/lib/access"
import { areaLabelKey } from "@/lib/navigation"

type Workspace = { org: { kind: string } }

export function requireBuyer(s: Workspace) {
  if (s.org.kind !== "buyer") {
    throw new LocalizedError("buyerWorkspaceRequired")
  }
}

export function requireSupplier(s: Workspace) {
  if (s.org.kind !== "supplier") {
    throw new LocalizedError("supplierWorkspaceRequired")
  }
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
