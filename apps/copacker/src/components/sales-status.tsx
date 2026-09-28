import { useTranslations } from "next-intl"
import { StatusBadge, type StatusTone } from "@/components/common"

// Shopify's, Amazon's and eBay's order statuses on the shared status tones: shipped is done, waiting to ship needs action,
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

// The statuses the server names orders with, by their message keys; any other shows as the server wrote it.
const statusNames = {
  Fulfilled: "fulfilled",
  Unfulfilled: "unfulfilled",
  "Partially fulfilled": "partiallyFulfilled",
  Pending: "pending",
  Shipped: "shipped",
  Unshipped: "unshipped",
  "Partially shipped": "partiallyShipped",
  Cancelled: "cancelled",
  Unfulfillable: "unfulfillable",
  Unknown: "unknown"
} as const
const isStatusName = (status: string): status is keyof typeof statusNames => Object.hasOwn(statusNames, status)

export function SalesStatus({ status }: { status: string }) {
  const t = useTranslations("sales.status")
  return (
    <StatusBadge tone={orderTones.get(status) ?? "neutral"}>
      {isStatusName(status) ? t(statusNames[status]) : status}
    </StatusBadge>
  )
}
