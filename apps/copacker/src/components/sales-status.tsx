import { StatusBadge, type StatusTone } from "@/components/common"

// Shopify's and Amazon's order statuses on the shared status tones: shipped is done, waiting to ship needs action,
// cancelled is lost, and anything else (such as Amazon's Pending) is neutral. The Orders page and the header's search
// both show them this way.
const orderTones = new Map<string, StatusTone>([
  ["Fulfilled", "success"],
  ["Shipped", "success"],
  ["Unfulfilled", "warning"],
  ["Partially fulfilled", "warning"],
  ["Unshipped", "warning"],
  ["Partially shipped", "warning"],
  ["Cancelled", "destructive"],
  ["Unfulfillable", "destructive"]
])

export function SalesStatus({ status }: { status: string }) {
  return <StatusBadge tone={orderTones.get(status) ?? "neutral"}>{status}</StatusBadge>
}
