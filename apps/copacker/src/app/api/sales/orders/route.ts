import { requirePage, session } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { salesOrderList } from "@/server/sales-order-list"

export const GET = withRequest(async function GET(request: Request) {
  const current = await session()
  if (current.org.kind === "buyer") {
    requirePage(current, "sales")
  }
  return salesOrderList(current, new URL(request.url).searchParams)
})
