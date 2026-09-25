import { session, requireBuyer } from "@/server/auth"
import { shopifyFor, amazonFor, connection } from "@/server/connections"
export async function GET(request: Request) {
  const s = await session()
  requireBuyer(s)
  const query = new URL(request.url).searchParams.get("q")?.slice(0, 200) ?? ""
  const variants = await (await shopifyFor(s.org.id)).search(query)
  try {
    const account = await connection(s.org.id, "amazon")
    const identities = await (
      await amazonFor(s.org.id, account.externalId)
    ).listings(
      account.externalId,
      variants.flatMap((item) => (item.sku ? [item.sku] : []))
    )
    return Response.json(
      variants.map((item) => ({
        ...item,
        amazonAsin: identities.get(item.sku ?? "")?.asin ?? "",
        fnsku: identities.get(item.sku ?? "")?.fnsku ?? "",
        amazonError: null
      }))
    )
  } catch {
    return Response.json(
      variants.map((item) => ({
        ...item,
        amazonAsin: "",
        fnsku: "",
        amazonError: "Amazon product lookup is unavailable. Check the connection and retry before creating the PO."
      }))
    )
  }
}
