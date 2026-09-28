import type { AmazonSale, ShopifySale } from "@repo/aisle/sales"
import { eq, type SQL, sql } from "drizzle-orm"
import { db } from "@/db"
import { organizations, salesOrders, salesSyncs } from "@/db/schema"

// The workspace's excluded Shopify order tags, trimmed and lower-cased: Shopify compares tags without regard to case.
export async function excludedShopifyTags(orgId: string) {
  const [org] = await db()
    .select({ tags: organizations.excludedShopifyTags })
    .from(organizations)
    .where(eq(organizations.id, orgId))
  return normalizeTags(org?.tags ?? [])
}

export function normalizeTags(tags: readonly string[]) {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

// An excluded tag may use * for any run of characters, so "amazon*" matches Amazon, Amazon-US and Amazon-CA.
// As a LIKE pattern: %, _ and \ in the tag match themselves.
const likePattern = (tag: string) => tag.replace(/[\\%_]/g, (match) => `\\${match}`).replaceAll("*", "%")
const tagPattern = (tag: string) =>
  new RegExp(
    `^${tag
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`
  )

// Whether a stored order's data (a jsonb expression) has a tag matching any of the (lower-cased) tags. Amazon orders,
// and Shopify orders copied before tags were read, have none.
export function taggedWith(data: SQL, tags: readonly string[]) {
  return tags.length
    ? sql`exists (select 1 from jsonb_array_elements_text(coalesce(${data}->'tags', '[]'::jsonb)) tag
        where ${sql.join(
          tags.map((tag) => sql`lower(tag) like ${likePattern(tag)}`),
          sql` or `
        )})`
    : sql`false`
}

export function hasExcludedTag(data: ShopifySale | AmazonSale, tags: readonly string[]) {
  const patterns = tags.map(tagPattern)
  return (
    "lines" in data &&
    Boolean(data.tags?.some((tag) => patterns.some((pattern) => pattern.test(tag.trim().toLowerCase()))))
  )
}

// Whether a Shopify sync is still copying tags: one is queued or running, and some order from the last `days` (the
// history syncs keep) was copied before tags were read, so excluded tags can't leave it out yet. Orders a finished sync
// didn't reach wait for a later one, and don't count as copying.
export async function untaggedShopifyOrders(orgId: string, days: number) {
  const result = await db().execute(sql`
    select exists (select 1 from ${salesSyncs} s
        where s."orgId" = ${orgId} and s.source = 'shopify' and s.status in ('queued', 'running'))
      and exists (select 1 from ${salesOrders} o
        where o."orgId" = ${orgId} and o.source = 'shopify' and not (o.data ? 'tags')
          and o."orderedAt" > now() - make_interval(days => ${days})) as untagged`)
  return (result as unknown as { rows: { untagged: unknown }[] }).rows[0]?.untagged === true
}

// The tags the store's copied Shopify orders use, most used first, to suggest when choosing tags to exclude.
export async function shopifyOrderTags(orgId: string) {
  const result = await db().execute(sql`
    select tag, count(*) as orders
    from ${salesOrders} o, jsonb_array_elements_text(coalesce(o.data->'tags', '[]'::jsonb)) tag
    where o."orgId" = ${orgId} and o.source = 'shopify'
    group by tag
    order by orders desc, tag
    limit 200`)
  return (result as unknown as { rows: { tag: unknown }[] }).rows.flatMap((row) =>
    typeof row.tag === "string" ? [row.tag] : []
  )
}
