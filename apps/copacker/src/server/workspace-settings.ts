import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db, type Executor } from "@/db"
import { organizations } from "@/db/schema"
import { isTimeZone } from "@/lib/time-zone"
import { dayRange } from "./restock-report"

// The settings an admin keeps for the whole workspace in Settings.

// An empty choice goes back to each viewer's computer's time zone.
export const timeZoneSchema = z.object({
  timeZone: z.union([z.literal(""), z.string().refine(isTimeZone, "errors.chooseTimeZone")])
})

export async function setTimeZone(orgId: string, timeZone: string) {
  await db()
    .update(organizations)
    .set({ timeZone: timeZone || null })
    .where(eq(organizations.id, orgId))
}

const days = z.number().int().min(dayRange.min).max(dayRange.max)

// The sales period and default lead time Restock starts from and the Overview uses.
export const restockDefaultsSchema = z.object({ salesDays: days, leadTimeDays: days })

export async function setRestockDefaults(
  orgId: string,
  { salesDays, leadTimeDays }: z.output<typeof restockDefaultsSchema>
) {
  await db()
    .update(organizations)
    .set({ restockSalesDays: salesDays, restockLeadTimeDays: leadTimeDays })
    .where(eq(organizations.id, orgId))
}

// The Shopify order tags a buyer leaves out of its order counts.
export const excludedTagsSchema = z.object({ tags: z.array(z.string().trim().min(1).max(255)).max(50) })

export async function setExcludedShopifyTags(orgId: string, tags: string[], executor: Executor = db()) {
  // Shopify compares tags without regard to case, so the first spelling of each is kept.
  const seen = new Set<string>()
  const kept = tags.filter((tag) => !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()))
  await executor
    .update(organizations)
    .set({ excludedShopifyTags: kept, settingsRevision: sql`${organizations.settingsRevision} + 1` })
    .where(eq(organizations.id, orgId))
}
