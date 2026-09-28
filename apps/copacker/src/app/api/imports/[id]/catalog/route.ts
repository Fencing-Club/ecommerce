import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { poImports } from "@/db/schema"
import { session, requireBuyer, requirePage } from "@/server/auth"
import { catalogMatches } from "@/server/catalog-matches"
import { shopifyFor } from "@/server/connections"
import { withVariantFields } from "@/server/product-fields"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  const { id } = await params
  const search = new URL(request.url).searchParams
  const input = z
    .object({ id: z.uuid(), query: z.string().trim().min(1).max(255), cursor: z.string().max(2000).nullable() })
    .safeParse({ id, query: search.get("q") ?? "", cursor: search.get("cursor") })
  if (!input.success) {
    return Response.json({ error: "Enter a product name, buyer SKU or supplier SKU" }, { status: 400 })
  }
  const [record] = await db()
    .select()
    .from(poImports)
    .where(and(eq(poImports.id, id), eq(poImports.orgId, s.org.id)))
  if (!record) {
    return Response.json({ error: "Import not found" }, { status: 404 })
  }
  try {
    const shop = await shopifyFor(s.org.id, record.shopifyDomain)
    const page = await shop.catalogPage(input.data.cursor)
    if (page.pageInfo.hasNextPage && (!page.pageInfo.endCursor || page.pageInfo.endCursor === input.data.cursor)) {
      throw new Error("Stalled catalog")
    }
    return Response.json(
      {
        results: catalogMatches(
          (await withVariantFields(s.org.id, shop.domain, page.nodes)).flatMap((variant) => (variant ? [variant] : [])),
          input.data.query
        ),
        nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null,
        complete: !page.pageInfo.hasNextPage
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return Response.json({ error: "Catalog search is unavailable. Try again." }, { status: 503 })
  }
}
