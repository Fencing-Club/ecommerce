import { randomUUID } from "node:crypto"
import { addressSchema } from "@repo/aisle"
import { buildAwdRequest } from "@repo/aisle"
import { WorkOS } from "@workos-inc/node"
import { and, eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { z } from "zod"
import { db } from "@/db"
import {
  organizations,
  memberships,
  suppliers,
  contacts,
  jobs,
  shipments,
  documents,
  events,
  teamInvitations
} from "@/db/schema"
import { accessibleOrder } from "@/server/access"
import { identity, session, requireOwner, requireBuyer, requireMembership } from "@/server/auth"
import { amazonFor, disconnect } from "@/server/connections"
import { acceptSupplierInvitation } from "@/server/invitations"
import {
  createOrder,
  submitOrder,
  newShipment,
  submitPacking,
  approveInvoice,
  correctShipment,
  savePacking,
  checkPacking
} from "@/server/orders"
import { releaseIssues } from "@/server/readiness"
import { appUrl, token, hash } from "@/server/security"

const inputSchema = z.object({ action: z.string(), data: z.record(z.string(), z.unknown()) })
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const { action, data } = inputSchema.parse(await request.json())
    if (action === "workspace.create") {
      const user = await identity(),
        input = z.object({ name: z.string().trim().min(2).max(120), kind: z.enum(["buyer", "supplier"]) }).parse(data)
      const id = randomUUID(),
        workos = new WorkOS(process.env.WORKOS_API_KEY)
      const remote = await workos.organizations.createOrganization({ name: input.name })
      await workos.userManagement.createOrganizationMembership({ userId: user.id, organizationId: remote.id })
      await db().transaction(async (tx) => {
        await tx.insert(organizations).values({ id, ...input, workosId: remote.id })
        await tx.insert(memberships).values({ orgId: id, userId: user.id, email: user.email, role: "owner" })
      })
      await setWorkspace(id)
      const next = typeof data.next === "string" && data.next.startsWith("/invite?") ? data.next : "/orders"
      return Response.json({ redirect: next })
    }
    if (action === "team.accept") {
      const user = await identity()
      const invitation = z.string().min(20).parse(data.token)
      if (!user.emailVerified) {
        throw new Error("Verify your email before accepting an invitation")
      }
      await db().transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(teamInvitations)
          .where(eq(teamInvitations.hash, hash(invitation)))
          .for("update")
        if (!row || row.email !== user.email.toLowerCase() || row.expiresAt < new Date()) {
          throw new Error("Invitation expired or belongs to a different email")
        }
        await tx
          .insert(memberships)
          .values({ orgId: row.orgId, userId: user.id, email: user.email, role: "member" })
          .onConflictDoNothing()
        await tx.delete(teamInvitations).where(eq(teamInvitations.id, row.id))
        await setWorkspace(row.orgId)
      })
      return Response.json({ redirect: "/orders" })
    }
    const s = await session()
    const id = () => z.uuid().parse(data.id),
      revision = () => z.number().int().positive().parse(data.revision)
    if (action === "team.invite") {
      requireOwner(s)
      const email = z.email().parse(data.email).toLowerCase(),
        invitation = token()
      const [row] = await db()
        .insert(teamInvitations)
        .values({ orgId: s.org.id, email, hash: hash(invitation), expiresAt: new Date(Date.now() + 7 * 86400000) })
        .returning()
      await db()
        .insert(jobs)
        .values({
          key: `team:${row!.id}`,
          kind: "email",
          payload: { type: "team", to: email, name: s.org.name, invitation }
        })
      return Response.json({ ok: true })
    }
    if (action === "team.remove") {
      requireOwner(s)
      const userId = z.string().parse(data.userId)
      if (userId === s.user.id) {
        throw new Error("You cannot remove your own membership")
      }
      await db()
        .delete(memberships)
        .where(and(eq(memberships.orgId, s.org.id), eq(memberships.userId, userId), eq(memberships.role, "member")))
      return Response.json({ ok: true })
    }
    if (action === "workspace.switch") {
      await requireMembership(s.user.id, id())
      await setWorkspace(id())
      return Response.json({ redirect: "/orders" })
    }
    if (action === "supplier.create") {
      requireBuyer(s)
      requireOwner(s)
      const input = z
          .object({ name: z.string().trim().min(2).max(120), email: z.email().transform((v) => v.toLowerCase()) })
          .parse(data),
        invitation = token()
      const [supplier] = await db()
        .insert(suppliers)
        .values({
          buyerOrgId: s.org.id,
          ...input,
          invitationHash: hash(invitation),
          expiresAt: new Date(Date.now() + 7 * 86400000)
        })
        .returning()
      await db()
        .insert(jobs)
        .values({
          key: `invite:${supplier!.id}`,
          kind: "email",
          payload: { type: "invite", to: input.email, name: s.org.name, invitation }
        })
      return Response.json({ id: supplier!.id })
    }
    if (action === "supplier.accept") {
      const input = z.object({ orgId: z.uuid(), token: z.string().min(20) }).parse(data)
      await acceptSupplierInvitation(s.user, input.orgId, input.token)
      await setWorkspace(input.orgId)
      return Response.json({ redirect: "/orders" })
    }
    if (action === "contact.create") {
      const input = z
        .object({ name: z.string().min(1).max(100), kind: z.enum(["forwarder", "pickup"]), address: addressSchema })
        .parse(data)
      await db()
        .insert(contacts)
        .values({ orgId: s.org.id, ...input })
      return Response.json({ ok: true })
    }
    if (action === "contact.update") {
      const input = z
        .object({ name: z.string().min(1).max(100), kind: z.enum(["forwarder", "pickup"]), address: addressSchema })
        .parse(data)
      const updated = await db()
        .update(contacts)
        .set(input)
        .where(and(eq(contacts.id, id()), eq(contacts.orgId, s.org.id)))
        .returning({ id: contacts.id })
      if (!updated.length) {
        return Response.json({ error: "This address was removed. Refresh the page and try again" }, { status: 404 })
      }
      return Response.json({ ok: true })
    }
    if (action === "connection.delete") {
      requireOwner(s)
      requireBuyer(s)
      const provider = z.enum(["amazon", "shopify"]).parse(data.provider)
      return Response.json({ ok: true, ...(await disconnect(s.org.id, provider)) })
    }
    if (action === "contact.delete") {
      const deleted = await db()
        .delete(contacts)
        .where(and(eq(contacts.id, id()), eq(contacts.orgId, s.org.id)))
        .returning({ id: contacts.id })
      if (!deleted.length) {
        return Response.json({ error: "This address was already removed" }, { status: 404 })
      }
      return Response.json({ ok: true })
    }
    if (action === "order.create") {
      const order = await createOrder(s, data)
      return Response.json({ redirect: `/orders/${order.id}` })
    }
    if (action === "order.submit") {
      return Response.json({ ok: true, ...(await submitOrder(s, id(), revision())) })
    }
    if (action === "shipment.create") {
      const shipment = await newShipment(s, id())
      return Response.json({ redirect: `/shipments/${shipment.id}` })
    }
    if (action === "shipment.save") {
      return Response.json(
        await savePacking(s, id(), data.draft, revision(), z.number().int().positive().parse(data.orderRevision))
      )
    }
    if (action === "shipment.check") {
      return Response.json(await checkPacking(s, id(), data.packing))
    }
    if (action === "shipment.submit") {
      return Response.json(await submitPacking(s, id(), data.packing, revision()))
    }
    if (action === "shipment.approve") {
      await approveInvoice(s, id(), revision(), z.boolean().parse(data.updateCost))
      return Response.json({ ok: true })
    }
    if (action === "shipment.correct") {
      await correctShipment(s, id(), z.string().parse(data.reason))
      return Response.json({ ok: true })
    }
    if (action === "shipment.retry") {
      requireBuyer(s)
      await db().transaction(async (tx) => {
        const [initial] = await tx.select().from(shipments).where(eq(shipments.id, id()))
        if (!initial) {
          throw new Error("Shipment not found")
        }
        await accessibleOrder(s, initial.orderId, tx, true)
        const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, id())).for("update")
        if (
          !shipment ||
          shipment.status !== "needs_attention" ||
          shipment.operation === "sending" ||
          shipment.revision !== revision()
        ) {
          throw new Error("Reconcile the uncertain Amazon creation before retrying")
        }
        await tx.update(shipments).set({ status: "queued", issue: null }).where(eq(shipments.id, shipment.id))
        await tx
          .insert(jobs)
          .values({
            key: `amazon:${shipment.id}:${shipment.revision}`,
            kind: "amazon",
            payload: { shipmentId: shipment.id, revision: shipment.revision }
          })
          .onConflictDoUpdate({
            target: jobs.key,
            set: { id: randomUUID(), status: "pending", attempts: 0, error: null, runAt: new Date() }
          })
      })
      return Response.json({ ok: true })
    }
    if (action === "shipment.reconcile") {
      requireBuyer(s)
      const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id()))
      if (!shipment?.snapshot || !shipment.packing || !["needs_attention", "correction"].includes(shipment.status)) {
        throw new Error("Shipment is not awaiting reconciliation")
      }
      const { order } = await accessibleOrder(s, shipment.orderId)
      const amazonOrderId = z
        .string()
        .regex(/^STAR-[A-Z0-9]+$/)
        .parse(data.amazonOrderId)
      if (shipment.amazonOrderId && shipment.amazonOrderId !== amazonOrderId) {
        throw new Error("This shipment is already linked to a different Amazon order")
      }
      const remote = await (await amazonFor(s.org.id, order.amazonSellerId)).order(amazonOrderId)
      const expected = buildAwdRequest(
        shipment.snapshot,
        shipment.packing,
        `copacker-${shipment.id}-${shipment.revision}`
      )
      if (remote.externalReferenceId !== expected.externalReferenceId) {
        throw new Error("Amazon order does not belong to this shipment revision")
      }
      if (order.buyerOrgId !== s.org.id) {
        throw new Error("Account mismatch")
      }
      await db().transaction(async (tx) => {
        const [current] = await tx.select().from(shipments).where(eq(shipments.id, shipment.id)).for("update")
        if (current?.revision !== shipment.revision || current?.status !== shipment.status) {
          throw new Error("Shipment changed while reconciling")
        }
        await tx
          .update(shipments)
          .set({ amazonOrderId, operation: "created", status: "queued", issue: null })
          .where(eq(shipments.id, shipment.id))
        await tx
          .insert(jobs)
          .values({
            key: `amazon:${shipment.id}:${shipment.revision}`,
            kind: "amazon",
            payload: { shipmentId: shipment.id, revision: shipment.revision }
          })
          .onConflictDoUpdate({
            target: jobs.key,
            set: { id: randomUUID(), status: "pending", attempts: 0, runAt: new Date(), error: null }
          })
      })
      return Response.json({ ok: true })
    }
    if (action === "shipment.cancelled") {
      requireBuyer(s)
      const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id()))
      if (!shipment?.amazonOrderId || shipment.status !== "correction") {
        throw new Error("An existing Amazon shipment must be in correction before replacement")
      }
      const { order } = await accessibleOrder(s, shipment.orderId)
      const remote = await (await amazonFor(s.org.id, order.amazonSellerId)).order(shipment.amazonOrderId)
      if (remote.orderStatus !== "CANCELLED") {
        throw new Error(
          "Cancel the shipment in Amazon first. Copacker will verify cancellation before releasing quantities"
        )
      }
      await db()
        .update(shipments)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(shipments.id, shipment.id),
            eq(shipments.revision, shipment.revision),
            eq(shipments.status, "correction")
          )
        )
      return Response.json({ ok: true })
    }
    if (action === "shipment.collected") {
      await db().transaction(async (tx) => {
        const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, id()))
        if (!shipment) {
          throw new Error("Shipment not found")
        }
        await accessibleOrder(s, shipment.orderId, tx, true)
        if (shipment.status !== "ready") {
          throw new Error("Only released shipments can be marked collected")
        }
        await tx.update(shipments).set({ status: "collected" }).where(eq(shipments.id, shipment.id))
        await tx
          .insert(events)
          .values({ orderId: shipment.orderId, actor: s.user.id, message: "Supplier reported shipment collected" })
      })
      return Response.json({ ok: true })
    }
    if (action === "job.retry") {
      requireBuyer(s)
      requireOwner(s)
      const [job] = await db().select().from(jobs).where(eq(jobs.id, id()))
      if (!job || job.kind === "amazon" || job.status !== "failed") {
        throw new Error("This job cannot be retried here")
      }
      const orderId = z.uuid().parse(job.payload.orderId)
      await accessibleOrder(s, orderId)
      await db().update(jobs).set({ status: "pending", runAt: new Date(), error: null }).where(eq(jobs.id, id()))
      return Response.json({ ok: true })
    }
    if (action === "shipment.release") {
      requireBuyer(s)
      await db().transaction(async (tx) => {
        const [initial] = await tx.select().from(shipments).where(eq(shipments.id, id()))
        if (!initial) {
          throw new Error("Shipment not found")
        }
        const { supplier } = await accessibleOrder(s, initial.orderId, tx, true)
        const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, id())).for("update")
        if (
          !shipment?.packing ||
          !shipment.snapshot ||
          shipment.status !== "waiting_labels" ||
          shipment.revision !== revision()
        ) {
          throw new Error("Shipment is not ready for label release")
        }
        const docs = await tx
          .select()
          .from(documents)
          .where(and(eq(documents.orderId, shipment.orderId), eq(documents.outdated, 0)))
        const issues = releaseIssues(shipment, docs)
        if (issues.length) {
          throw new Error(issues.map((issue) => issue.message).join("\n"))
        }
        await tx
          .update(shipments)
          .set({ status: "ready", bookingReference: z.string().trim().min(1).max(100).parse(data.bookingReference) })
          .where(eq(shipments.id, id()))
        await tx
          .insert(jobs)
          .values({
            key: `ready:${shipment.id}:${shipment.revision}`,
            kind: "email",
            payload: { type: "ready", to: supplier.email, orderId: shipment.orderId, shipmentId: shipment.id }
          })
          .onConflictDoNothing()
        await tx
          .insert(events)
          .values({ orderId: shipment.orderId, actor: s.user.id, message: "Shipping labels released to supplier" })
      })
      return Response.json({ ok: true })
    }
    throw new Error("Unknown action")
  } catch (error) {
    let message = "Request failed"
    if (error instanceof z.ZodError) {
      message = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")
    } else if (error instanceof Error) {
      message = error.message
    }
    return Response.json(
      { error: message.startsWith("Failed query:") ? "Could not save this change. Refresh and try again" : message },
      { status: 400 }
    )
  }
}
async function setWorkspace(id: string) {
  ;(await cookies()).set("copacker-workspace", id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  })
}
