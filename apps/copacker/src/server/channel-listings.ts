import { randomUUID } from "node:crypto"
import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { amazonListingPage, amazonListingValues } from "@repo/copacker-marketplaces/listing-writes"
import { and, eq, inArray, ne, sql } from "drizzle-orm"
import { db } from "@/db"
import { channelListings, connections, jobs } from "@/db/schema"
import { amazonFor } from "./connections"
import { withJobWake } from "./job-delivery"
import { jobRow, type JobInput } from "./job-payloads"
import { PollAgain, type JobContext } from "./job-runtime"

export async function queueListings(orgId: string, connectionId: string, accountId: string) {
  const active = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.kind, "listings"),
        sql`${jobs.payload}->>'connectionId' = ${connectionId}`,
        sql`${jobs.payload}->>'accountId' = ${accountId}`,
        inArray(jobs.status, ["pending", "running"])
      )
    )
  if (active.length) {
    return active.map((job) => job.id)
  }
  const generation = randomUUID()
  return withJobWake(
    db()
      .insert(jobs)
      .values(
        jobRow("listings", `listings:${connectionId}:${generation}`, {
          orgId,
          connectionId,
          accountId,
          generation,
          seenTokens: []
        })
      )
      .returning({ id: jobs.id })
      .then((rows) => rows.map((row) => row.id))
  )
}
export async function listingsJob(
  input: JobInput<"listings">,
  { assertOwned, owned }: Pick<JobContext, "assertOwned" | "owned">
) {
  await assertOwned()
  const api = await amazonFor(input.orgId, input.accountId)
  const page = await amazonListingPage(api, input.accountId, input.pageToken)
  const values = page.items.map(amazonListingValues)
  if (new Set(values.map((row) => row.sellerSku)).size !== values.length) {
    throw new Error("Duplicate listing page identities")
  }
  const next = page.pagination?.nextToken
  if (next && (input.seenTokens.includes(next) || input.seenTokens.length >= 500)) {
    throw new Error("Listing pagination did not complete")
  }
  await assertOwned()
  await db().transaction(async (tx) => {
    const [job] = await tx.select({ id: jobs.id }).from(jobs).where(owned).for("update")
    if (!job) {
      throw new Error("Listing worker ownership changed")
    }
    const [account] = await tx
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.id, input.connectionId),
          eq(connections.orgId, input.orgId),
          eq(connections.externalId, input.accountId),
          eq(connections.provider, "amazon")
        )
      )
      .for("update")
    if (!account) {
      throw new Error("Listing account changed")
    }
    for (const value of values) {
      const [prior] = await tx
        .select()
        .from(channelListings)
        .where(
          and(
            eq(channelListings.orgId, input.orgId),
            eq(channelListings.connectionId, input.connectionId),
            eq(channelListings.accountId, input.accountId),
            eq(channelListings.marketplaceId, usMarketplaceId),
            eq(channelListings.sellerSku, value.sellerSku),
            eq(channelListings.generation, input.generation)
          )
        )
      if (prior) {
        if (
          prior.asin !== value.asin ||
          prior.productType !== value.productType ||
          prior.fulfillmentMode !== value.fulfillmentMode ||
          prior.amountMinor !== value.amountMinor ||
          prior.currency !== value.currency ||
          prior.quantity !== value.quantity
        ) {
          throw new Error("Listing identity changed during pagination; start a fresh discovery")
        }
        continue
      }
      await tx
        .insert(channelListings)
        .values({
          ...value,
          orgId: input.orgId,
          connectionId: input.connectionId,
          accountId: input.accountId,
          marketplaceId: usMarketplaceId,
          observedAt: new Date(),
          generation: input.generation
        })
        .onConflictDoUpdate({
          target: [
            channelListings.orgId,
            channelListings.connectionId,
            channelListings.accountId,
            channelListings.marketplaceId,
            channelListings.sellerSku
          ],
          set: {
            ...value,
            observedAt: new Date(),
            generation: input.generation,
            active: true,
            revision: sql`${channelListings.revision} + 1`
          }
        })
    }
    // Missing offers are retired only after a complete traversal; partial ingestion never erases prior evidence.
    if (!next) {
      await tx
        .update(channelListings)
        .set({ active: false, revision: sql`${channelListings.revision} + 1` })
        .where(
          and(
            eq(channelListings.orgId, input.orgId),
            eq(channelListings.connectionId, input.connectionId),
            eq(channelListings.accountId, input.accountId),
            ne(channelListings.generation, input.generation),
            eq(channelListings.active, true)
          )
        )
    }
  })
  if (next) {
    throw new PollAgain("Continue listing discovery", {
      payload: { ...input, pageToken: next, seenTokens: [...input.seenTokens, next] },
      progressed: true,
      delayMs: 1000
    })
  }
}
