import { variantIdSchema } from "@repo/copacker-marketplaces/shopify"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { connections } from "@/db/schema"
import { session, requirePage } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { shopifyFor, amazonFor, connection } from "@/server/connections"
import { lineDefaultsFor } from "@/server/product-defaults"
import { withVariantFields } from "@/server/product-fields"
export async function GET(request: Request) {
  const s = await session()
  requireBuyer(s)
  // Purchase orders' product picker reads it.
  requirePage(s, "orders", "edit")
  // The variations chosen in the add-products dialog, by ID.
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .filter((id) => variantIdSchema.safeParse(id).success)
    .slice(0, 250)
  if (!ids.length) {
    return Response.json([])
  }
  const defaultsFor = await lineDefaultsFor(s.org.id)
  const shopify = await shopifyFor(s.org.id)
  const found = await withVariantFields(s.org.id, shopify.domain, await shopify.variants(ids))
  const variants = found
    .flatMap((item) => (item ? [item] : []))
    .map((item) => ({
      ...item,
      lineDefaults: defaultsFor(item)
    }))
  const [amazon] = await db()
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "amazon")))
  if (!amazon) {
    // Amazon is optional; its identifiers are looked up when the PO is sent.
    return Response.json(variants.map((item) => ({ ...item, amazonAsin: "", fnsku: "", amazonError: null })))
  }
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
        amazonError:
          "Amazon product lookup is unavailable. Check the connection and retry before creating the purchase order."
      }))
    )
  }
}
