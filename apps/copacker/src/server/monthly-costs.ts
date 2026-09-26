import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { monthlyCosts } from "@/db/schema"
import type { Session } from "./auth"

function requireBuyer(s: Session) {
  if (s.org.kind !== "buyer") {
    throw new Error("A buyer workspace is required")
  }
}

export const monthlyCostChannels = { amazon: "Amazon", shopify: "Shopify" } as const

const day = z.iso.date()
export const monthlyCostInputSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(100),
    // In minor units of `currency`.
    amount: z.number().int().min(1).max(100000000),
    currency: z.string().regex(/^[A-Z]{3}$/),
    channel: z.enum(["amazon", "shopify"]).nullable().default(null),
    startsOn: day.nullable().default(null),
    endsOn: day.nullable().default(null)
  })
  .refine((input) => !input.startsOn || !input.endsOn || input.startsOn <= input.endsOn, {
    message: "The end date can't be before the start date",
    path: ["endsOn"]
  })

// Records a cost paid every month that no connected platform reports, such as an app billed to a card.
export async function addMonthlyCost(s: Session, raw: unknown) {
  requireBuyer(s)
  const input = monthlyCostInputSchema.parse(raw)
  const [row] = await db()
    .insert(monthlyCosts)
    .values({
      orgId: s.org.id,
      name: input.name,
      amountMinor: input.amount,
      currency: input.currency,
      channel: input.channel,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      createdBy: s.user.id
    })
    .returning({ id: monthlyCosts.id })
  return row!
}

export async function removeMonthlyCost(s: Session, id: string) {
  requireBuyer(s)
  const removed = await db()
    .delete(monthlyCosts)
    .where(and(eq(monthlyCosts.id, z.uuid().parse(id)), eq(monthlyCosts.orgId, s.org.id)))
    .returning({ id: monthlyCosts.id })
  if (!removed.length) {
    throw new Error("Monthly cost not found")
  }
}

export async function listMonthlyCosts(orgId: string) {
  return db()
    .select({
      id: monthlyCosts.id,
      name: monthlyCosts.name,
      amountMinor: monthlyCosts.amountMinor,
      currency: monthlyCosts.currency,
      channel: monthlyCosts.channel,
      startsOn: monthlyCosts.startsOn,
      endsOn: monthlyCosts.endsOn
    })
    .from(monthlyCosts)
    .where(eq(monthlyCosts.orgId, orgId))
    .orderBy(asc(monthlyCosts.createdAt))
}

export type MonthlyCost = Awaited<ReturnType<typeof listMonthlyCosts>>[number]

// Each cost's share of a period, from the days it was paid in it: a month's amount over the average month's days
// (365 / 12), so a year of days carries 12 months. `from` and `to` are calendar days, `to` excluded.
export function monthlyCostShares(costs: readonly MonthlyCost[], from: string, to: string) {
  return costs.flatMap((cost) => {
    const start = cost.startsOn && cost.startsOn > from ? cost.startsOn : from
    // The last day is paid too, so the period it covers ends the day after.
    const endsAfter = cost.endsOn ? nextDay(cost.endsOn) : to
    const end = endsAfter < to ? endsAfter : to
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000)
    return days > 0 ? [{ ...cost, shareMinor: Math.round((cost.amountMinor * 12 * days) / 365) }] : []
  })
}

function nextDay(date: string) {
  return new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)
}
