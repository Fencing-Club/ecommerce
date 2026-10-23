import { randomUUID } from "node:crypto"
import { canonicalJson, providerTarget, providerWriteInput, providerWriteResult } from "@repo/copacker-contract"
import { ListingWriteRejected, writeAmazonListing, writeShopifyField } from "@repo/copacker-marketplaces/listing-writes"
import { ShopifyWriteRejected } from "@repo/copacker-marketplaces/shopify"
import { and, eq, inArray } from "drizzle-orm"
import type { z } from "zod"
import { db, withTransaction, type Transaction } from "@/db"
import {
  cliGrants,
  jobs,
  memberships,
  providerWriteLocks,
  providerWrites,
  organizations,
  connections
} from "@/db/schema"
import { can, effectiveAccess } from "@/lib/access"
import { CliError } from "./cli-auth"
import { amazonFor, shopifyFor } from "./connections"
import { withJobWake, withDeferredJobWake } from "./job-delivery"
import { jobRow } from "./job-payloads"
import { PollAgain, type JobContext } from "./job-runtime"
import { writeDestinations, writeIntent, type WriteDestination } from "./provider-write-model"
import { observeTarget, resolveWrite } from "./provider-write-routing"
import { refreshStock } from "./stock"
import type { Session } from "./workspace-session"

type Write = typeof providerWrites.$inferSelect
function terminalStatus(targets: WriteDestination[]): Write["status"] {
  if (targets.some((target) => target.state === "outcome_unknown")) {
    return "needs_attention"
  }
  if (targets.every((target) => target.state === "confirmed")) {
    return "succeeded"
  }
  return targets.some((target) => target.state === "confirmed") ? "partially_succeeded" : "failed"
}
export function requireWriteAccess(s: Pick<Session, "role" | "access">, field: WriteDestination["field"]) {
  if (
    !can(s, "products", "edit") ||
    ((field === "cost" || field === "price") && !can(s, "prices")) ||
    (field === "inventory" && !can(s, "inventory", "edit"))
  ) {
    throw new CliError(
      "forbidden",
      "Current product, price and inventory permissions are required for this change.",
      403
    )
  }
}
function result(row: Write) {
  const targets = writeDestinations.parse(row.targets).map((target) => providerTarget.strip().parse(target))
  if (row.status === "preview") {
    return providerWriteResult.parse({
      previewId: row.id,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      targets
    })
  }
  const statusQuery = { operation: row.operation, input: { mode: "read", executionId: row.id } }
  return providerWriteResult.parse({
    targets,
    statusQuery,
    operation: {
      id: row.id,
      name: row.operation,
      status: row.status,
      stage: "provider_write",
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      error: ["failed", "partially_succeeded", "needs_attention"].includes(row.status)
        ? {
            code: row.status === "needs_attention" ? "outcome_unknown" : "partial_write",
            message: "Inspect each destination before starting another change.",
            retryable: false,
            issues: [],
            recovery: null
          }
        : null,
      recovery: null
    }
  })
}
async function readWrite(s: Session, operation: string, id: string) {
  const [row] = await db()
    .select()
    .from(providerWrites)
    .where(
      and(
        eq(providerWrites.id, id),
        eq(providerWrites.orgId, s.org.id),
        eq(providerWrites.userId, s.user.id),
        eq(providerWrites.operation, operation)
      )
    )
  if (!row) {
    throw new CliError("not_found", "Write execution not found.", 404)
  }
  requireWriteAccess(s, writeIntent.parse(row.intent).change.field)
  return row
}
export async function providerWrite(
  s: Session,
  grantId: string,
  operation: string,
  input: z.infer<typeof providerWriteInput>
) {
  if (s.org.kind !== "buyer") {
    throw new CliError("forbidden", "Provider writes require a buyer workspace.", 403)
  }
  if (
    "change" in input &&
    operation !==
      {
        sku: "product.variant.update",
        cost: "product.cost.update",
        price: "product.price.update",
        inventory: "inventory.update"
      }[input.change.field]
  ) {
    throw new CliError("invalid_input", "Use the operation for this field.")
  }
  if (input.mode === "read") {
    return result(await readWrite(s, operation, input.executionId))
  }
  await db().select({ id: organizations.id }).from(organizations).where(eq(organizations.id, s.org.id)).for("update")
  await db()
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.orgId, s.org.id))
    .orderBy(connections.id)
    .for("update")
  let row: Write
  if (input.mode === "apply") {
    row = await readWrite(s, operation, input.previewId)
    if (input.variantId && input.variantId !== row.variantId) {
      throw new CliError("invalid_input", "This preview belongs to a different variant.")
    }
    const [locked] = await db().select().from(providerWrites).where(eq(providerWrites.id, row.id)).for("update")
    row = locked!
    if (row.status !== "preview") {
      return result(row)
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new CliError("preview_expired", "Create a fresh preview.", 409)
    }
    const fresh = await resolveWrite(s, writeIntent.parse(row.intent))
    if (canonicalJson(fresh) !== canonicalJson(row.targets)) {
      throw new CliError("dependency_changed", "Preview dependencies changed. Review again.", 409)
    }
  } else {
    requireWriteAccess(s, input.change.field)
    const targets = await resolveWrite(s, input)
    const [created] = await db()
      .insert(providerWrites)
      .values({
        orgId: s.org.id,
        userId: s.user.id,
        grantId,
        operation,
        variantId: input.variantId,
        intent: input,
        targets,
        status: "preview",
        expiresAt: new Date(Date.now() + 86400_000)
      })
      .returning()
    row = created!
    if (input.mode === "preview") {
      return result(row)
    }
  }
  const targets = writeDestinations.parse(row.targets)
  // Acquire every field before any dispatch. Conflicting accepted/uncertain requests retain their locks.
  for (const target of [...targets].sort((a, b) => a.lockKey.localeCompare(b.lockKey))) {
    const acquired = await db()
      .insert(providerWriteLocks)
      .values({ key: target.lockKey, executionId: row.id })
      .onConflictDoNothing()
      .returning()
    if (!acquired.length) {
      throw new CliError(
        "write_in_progress",
        "A previous change still owns one of these provider fields. Inspect it before starting another.",
        409
      )
    }
  }
  const jobId = randomUUID()
  await withJobWake(
    db()
      .insert(jobs)
      .values({
        ...jobRow("provider-write", `provider-write:${row.id}`, { orgId: s.org.id, executionId: row.id }),
        id: jobId
      })
  )
  const [accepted] = await db()
    .update(providerWrites)
    .set({ status: "queued", grantId, jobId, startedAt: new Date() })
    .where(eq(providerWrites.id, row.id))
    .returning()
  return result(accepted!)
}
async function authorized(row: Write, field: WriteDestination["field"]) {
  const [grant] = await db().select().from(cliGrants).where(eq(cliGrants.id, row.grantId))
  const [member] = await db()
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, row.orgId), eq(memberships.userId, row.userId)))
  if (!grant || grant.userId !== row.userId || grant.revokedAt || grant.expiresAt.getTime() <= Date.now() || !member) {
    throw new CliError("forbidden", "The execution's authorization expired or was revoked.", 403)
  }
  requireWriteAccess({ role: member.role, access: effectiveAccess("buyer", member.access) }, field)
}
async function dispatch(row: Write, target: WriteDestination) {
  if (target.provider === "amazon") {
    const common = { sellerId: target.accountId, sku: target.externalId, productType: target.productType! }
    const reply = await writeAmazonListing(
      await amazonFor(row.orgId, target.accountId),
      target.field === "price"
        ? { ...common, field: "price", amountMinor: Number(target.desired), currency: "USD" }
        : { ...common, field: "inventory", quantity: Number(target.desired) }
    )
    if (reply.sku !== target.externalId) {
      throw new Error("Provider write identity mismatch")
    }
    if (reply.status !== "ACCEPTED") {
      throw new ListingWriteRejected("Amazon rejected this listing change")
    }
    target.submissionId = reply.submissionId
    return
  }
  const api = await shopifyFor(row.orgId, target.accountId)
  const common = { inventoryItemId: target.inventoryItemId! }
  if (target.field === "sku") {
    await writeShopifyField(api, { ...common, field: "sku", sku: String(target.desired) })
  } else if (target.field === "cost") {
    await api.unitCost(target.inventoryItemId!, Number(target.desired))
  } else if (target.field === "price") {
    await writeShopifyField(api, {
      field: "price",
      productId: target.productId!,
      variantId: target.externalId,
      amountMinor: Number(target.desired)
    })
  } else {
    await writeShopifyField(api, {
      ...common,
      field: "inventory",
      locationId: target.locationExternalId!,
      quantityState: target.quantityState!,
      quantity: Number(target.desired),
      expectedQuantity: Number(target.before),
      key: `${row.id}:${target.lockKey}`
    })
  }
}
export async function providerWriteJob(
  input: { orgId: string; executionId: string },
  context: Pick<JobContext, "assertOwned" | "owned">
) {
  await context.assertOwned()
  const [row] = await db()
    .select()
    .from(providerWrites)
    .where(and(eq(providerWrites.id, input.executionId), eq(providerWrites.orgId, input.orgId)))
  if (!row || !["queued", "running"].includes(row.status)) {
    return
  }
  const targets = writeDestinations.parse(row.targets)
  // Every state transition is fenced by both job ownership and the execution row. No provider call occurs inside it.
  async function save() {
    await db().transaction(async (tx) => {
      const [owned] = await tx.select({ id: jobs.id }).from(jobs).where(context.owned).for("update")
      if (!owned) {
        throw new Error("Provider execution ownership changed")
      }
      await tx
        .update(providerWrites)
        .set({ targets, status: "running" })
        .where(eq(providerWrites.id, input.executionId))
    })
  }
  const uncertain = targets.find((target) => target.state === "dispatching")
  if (uncertain) {
    uncertain.state = "outcome_unknown"
    uncertain.issue = "The worker stopped after dispatch was claimed. The request will not be sent again."
    await save()
  }
  if (targets.every((target) => target.state === "pending")) {
    try {
      for (const target of targets) {
        await context.assertOwned()
        await authorized(row, target.field)
        if ((await observeTarget(row.orgId, target)) !== target.before) {
          throw new CliError("revision_conflict", "A destination changed before any dispatch.", 409)
        }
      }
    } catch (error) {
      for (const target of targets) {
        target.state = "failed"
        target.issue = error instanceof CliError ? error.code : "Provider preflight failed; no writes were dispatched."
      }
      await save()
    }
  }
  for (const target of targets) {
    await context.assertOwned()
    if (["confirmed", "failed", "superseded", "outcome_unknown"].includes(target.state)) {
      continue
    }
    if (
      targets.some(
        (prior) => prior.role === "source" && ["failed", "outcome_unknown", "superseded"].includes(prior.state)
      )
    ) {
      target.state = "superseded"
      target.issue = "The authoritative source did not complete."
      await save()
      continue
    }
    if (target.role === "target" && targets.some((prior) => prior.role === "source" && prior.state !== "confirmed")) {
      break
    }
    if (target.state === "pending") {
      try {
        await authorized(row, target.field)
        if ((await observeTarget(row.orgId, target)) !== target.before) {
          throw new CliError("revision_conflict", "Provider value changed before dispatch.", 409)
        }
      } catch (error) {
        target.state = "failed"
        target.issue = error instanceof CliError ? error.code : "Provider preflight failed; no write was dispatched."
        await save()
        continue
      }
      if (target.before === target.desired) {
        target.state = "confirmed"
        await save()
        continue
      }
      target.state = "dispatching"
      await save()
      await context.assertOwned()
      try {
        await dispatch(row, target)
        target.state = "accepted"
      } catch (error) {
        const rejected = error instanceof ListingWriteRejected || error instanceof ShopifyWriteRejected
        target.state = rejected ? "failed" : "outcome_unknown"
        target.issue = rejected
          ? "The provider rejected the change."
          : "The provider outcome is uncertain; this request will not be sent again."
      }
      await save()
    }
    if (target.state === "accepted") {
      target.attempts++
      try {
        if ((await observeTarget(row.orgId, target)) === target.desired) {
          target.state = "confirmed"
        }
      } catch {
        /* Keep the accepted submission for later readback, without redispatching it. */
      }
      if (target.state === "accepted" && target.attempts >= 20) {
        target.state = "outcome_unknown"
        target.issue = "The provider accepted the request but its live value was not confirmed."
      }
      await save()
      if (target.state === "accepted") {
        break
      }
    }
  }
  const unresolved = targets.some((target) => target.state === "outcome_unknown")
  const waiting = targets.some((target) => ["pending", "accepted"].includes(target.state))
  if (!unresolved && waiting) {
    throw new PollAgain("Waiting for provider confirmation", { delayMs: 30000, progressed: true })
  }
  if (unresolved) {
    for (const target of targets) {
      if (target.state === "pending") {
        target.state = "superseded"
        target.issue = "An earlier destination requires reconciliation."
      }
    }
  }
  const confirmed = targets.filter((target) => target.state === "confirmed").length
  const status = terminalStatus(targets)
  await withDeferredJobWake(() =>
    db().transaction(async (tx) => {
      const [owned] = await tx.select({ id: jobs.id }).from(jobs).where(context.owned).for("update")
      if (!owned) {
        throw new Error("Provider execution ownership changed")
      }
      await tx
        .update(providerWrites)
        .set({ status, targets, completedAt: unresolved ? null : new Date() })
        .where(eq(providerWrites.id, row.id))
      const releasable = targets
        .filter((target) => ["confirmed", "failed", "superseded"].includes(target.state))
        .map((target) => target.lockKey)
      if (releasable.length) {
        await tx
          .delete(providerWriteLocks)
          .where(and(eq(providerWriteLocks.executionId, row.id), inArray(providerWriteLocks.key, releasable)))
      }
      if (confirmed) {
        await withTransaction(tx, () => refreshStock({ id: row.orgId, kind: "buyer" }, { source: "shopify" }))
      }
    })
  )
}

export async function providerWriteFailed(tx: Transaction, input: { orgId: string; executionId: string }) {
  const [row] = await tx
    .select()
    .from(providerWrites)
    .where(and(eq(providerWrites.id, input.executionId), eq(providerWrites.orgId, input.orgId)))
    .for("update")
  if (!row || !["queued", "running"].includes(row.status)) {
    return
  }
  const targets = writeDestinations.parse(row.targets)
  for (const target of targets) {
    if (target.state === "pending") {
      target.state = "failed"
      target.issue = "Worker stopped before dispatch."
    }
    if (target.state === "dispatching" || target.state === "accepted") {
      target.state = "outcome_unknown"
      target.issue = "Worker stopped before the provider outcome was confirmed."
    }
  }
  const unknown = targets.some((target) => target.state === "outcome_unknown")
  await tx
    .update(providerWrites)
    .set({ targets, status: terminalStatus(targets), completedAt: unknown ? null : new Date() })
    .where(eq(providerWrites.id, row.id))
  const releasable = targets.filter((target) => target.state !== "outcome_unknown").map((target) => target.lockKey)
  if (releasable.length) {
    await tx
      .delete(providerWriteLocks)
      .where(and(eq(providerWriteLocks.executionId, row.id), inArray(providerWriteLocks.key, releasable)))
  }
}
