import { randomUUID } from "node:crypto"
import { addressSchema } from "@repo/aisle"
import { WorkOS } from "@workos-inc/node"
import { and, eq, isNull } from "drizzle-orm"
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
  teamInvitations,
  supplierProfiles
} from "@/db/schema"
import { contactKinds, contactKindsFor } from "@/lib/contacts"
import { isTimeZone } from "@/lib/time-zone"
import { accessibleOrder } from "@/server/access"
import { queueAmazonSubscription } from "@/server/amazon-notifications"
import { identity, session, requireOwner, requireBuyer, requireMembership } from "@/server/auth"
import { addComment } from "@/server/comments"
import { amazonFor, disconnect, connectAmazonSelfAuthorized } from "@/server/connections"
import { amazonReference, cancelAmazonShipment, fbaPlanName } from "@/server/fba-shipments"
import {
  acceptForwarderInvitation,
  createForwarder,
  inviteForwarder,
  removeForwarder,
  renameForwarder,
  saveForwarderAddress
} from "@/server/forwarders"
import { acceptSupplierInvitation } from "@/server/invitations"
import { addLandedCost, removeLandedCost } from "@/server/landed-costs"
import { addMonthlyCost, removeMonthlyCost } from "@/server/monthly-costs"
import {
  createOrder,
  updateDraftOrder,
  submitOrder,
  newShipment,
  submitPacking,
  approveInvoice,
  correctShipment,
  savePacking,
  checkPacking,
  closeOrder,
  deleteDraftOrder,
  receiveShipment
} from "@/server/orders"
import { linesMissingLabels } from "@/server/product-barcodes"
import { saveProfile } from "@/server/profile"
import { releaseIssues } from "@/server/readiness"
import { dayRange } from "@/server/restock-report"
import { appUrl, token, hash } from "@/server/security"
import { forwardShipment, shipShipment } from "@/server/shipment-legs"
import { removeSupplier, supplierContactSchema, updateSupplier } from "@/server/suppliers"

const inputSchema = z.object({ action: z.string(), data: z.record(z.string(), z.unknown()) })
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const { action, data } = inputSchema.parse(await request.json())
    if (action === "workspace.create") {
      const user = await identity(),
        input = z
          .object({ name: z.string().trim().min(2).max(120), kind: z.enum(["buyer", "supplier", "forwarder"]) })
          .parse(data)
      const id = randomUUID(),
        workos = new WorkOS(process.env.WORKOS_API_KEY)
      const remote = await workos.organizations.createOrganization({ name: input.name })
      await workos.userManagement.createOrganizationMembership({ userId: user.id, organizationId: remote.id })
      await db().transaction(async (tx) => {
        await tx.insert(organizations).values({ id, ...input, workosId: remote.id })
        await tx.insert(memberships).values({ orgId: id, userId: user.id, email: user.email, role: "owner" })
      })
      await setWorkspace(id)
      const next = typeof data.next === "string" && data.next.startsWith("/invite?") ? data.next : "/"
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
      return Response.json({ redirect: "/" })
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
      return Response.json({ redirect: "/" })
    }
    if (action === "supplier.create") {
      requireBuyer(s)
      requireOwner(s)
      // The email is optional: a supplier can get POs without joining Copacker, and is invited once it has one.
      const input = z
        .object({
          name: z.string().trim().min(2).max(120),
          email: z
            .union([z.email(), z.literal("")])
            .optional()
            .transform((v) => v?.toLowerCase() || null)
        })
        .parse(data)
      const invitation = input.email ? token() : null
      const invite = invitation
        ? { invitationHash: hash(invitation), expiresAt: new Date(Date.now() + 7 * 86400000) }
        : { invitationHash: null, expiresAt: null }
      const [existing] = await db()
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.buyerOrgId, s.org.id), eq(suppliers.name, input.name)))
      if (existing && !existing.removedAt) {
        throw new Error(`${input.name} is already one of your suppliers`)
      }
      // Adding a removed supplier again restores it, so its earlier POs stay together. It joins again by invitation.
      const [supplier] = existing
        ? await db()
            .update(suppliers)
            .set({ email: input.email, ...invite, supplierOrgId: null, removedAt: null })
            .where(eq(suppliers.id, existing.id))
            .returning()
        : await db()
            .insert(suppliers)
            .values({ buyerOrgId: s.org.id, ...input, ...invite })
            .returning()
      if (invitation && input.email) {
        await db()
          .insert(jobs)
          .values({
            key: `invite:${supplier!.id}:${randomUUID()}`,
            kind: "email",
            payload: { type: "invite", to: input.email, name: s.org.name, invitation }
          })
      }
      return Response.json({ id: supplier!.id })
    }
    // Invites a supplier that hasn't joined, or sends its invitation again; an email given here replaces the saved one.
    if (action === "supplier.invite" || action === "supplier.resend") {
      requireBuyer(s)
      requireOwner(s)
      const email = z
        .union([z.email(), z.literal("")])
        .optional()
        .transform((v) => v?.toLowerCase() || null)
        .parse(data.email)
      // A fresh token replaces the old one, so earlier invitation links stop working.
      const invitation = token()
      await db().transaction(async (tx) => {
        const [supplier] = await tx
          .update(suppliers)
          .set({
            invitationHash: hash(invitation),
            expiresAt: new Date(Date.now() + 7 * 86400000),
            ...(email && { email })
          })
          .where(
            and(
              eq(suppliers.id, id()),
              eq(suppliers.buyerOrgId, s.org.id),
              isNull(suppliers.supplierOrgId),
              isNull(suppliers.removedAt)
            )
          )
          .returning()
        if (!supplier) {
          throw new Error("This supplier has already joined or was removed")
        }
        if (!supplier.email) {
          throw new Error("Enter the supplier's email to invite them")
        }
        // Each send is its own job: the job key doubles as the email provider's idempotency key, which rejects a
        // reused key carrying a different invitation.
        await tx.insert(jobs).values({
          key: `invite:${supplier.id}:${randomUUID()}`,
          kind: "email",
          payload: { type: "invite", to: supplier.email, name: s.org.name, invitation }
        })
      })
      return Response.json({ ok: true })
    }
    if (action === "supplier.remove") {
      requireBuyer(s)
      requireOwner(s)
      await removeSupplier(s.org.id, id())
      return Response.json({ ok: true })
    }
    if (action === "supplier.update") {
      requireBuyer(s)
      await updateSupplier(s.org.id, data)
      return Response.json({ ok: true })
    }
    if (action === "forwarder.accept") {
      const input = z.object({ orgId: z.uuid(), token: z.string().min(20) }).parse(data)
      await acceptForwarderInvitation(s.user, input.orgId, input.token)
      await setWorkspace(input.orgId)
      return Response.json({ redirect: "/settings" })
    }
    if (action === "forwarder.create") {
      requireBuyer(s)
      requireOwner(s)
      const forwarder = await createForwarder(s.org, data)
      return Response.json({ id: forwarder.id })
    }
    if (action === "forwarder.rename") {
      requireBuyer(s)
      requireOwner(s)
      await renameForwarder(s.org.id, id(), data)
      return Response.json({ ok: true })
    }
    if (action === "forwarder.remove") {
      requireBuyer(s)
      requireOwner(s)
      await removeForwarder(s.org.id, id())
      return Response.json({ ok: true })
    }
    if (action === "forwarder.invite") {
      requireBuyer(s)
      requireOwner(s)
      await inviteForwarder(s.org, id(), data.email)
      return Response.json({ ok: true })
    }
    if (action === "forwarder.address") {
      requireBuyer(s)
      requireOwner(s)
      await saveForwarderAddress(s.org.id, data)
      return Response.json({ ok: true })
    }
    if (action === "supplier.accept") {
      const input = z.object({ orgId: z.uuid(), token: z.string().min(20) }).parse(data)
      await acceptSupplierInvitation(s.user, input.orgId, input.token)
      await setWorkspace(input.orgId)
      return Response.json({ redirect: "/orders" })
    }
    if (action === "contact.create") {
      const input = z
        .object({
          name: z.string().min(1).max(100),
          kind: z.enum(contactKinds),
          address: addressSchema,
          shopifyLocationId: z
            .string()
            .regex(/^gid:\/\/shopify\/Location\/\d+$/)
            .nullable()
            .default(null)
        })
        .transform((contact) => ({
          ...contact,
          shopifyLocationId: contact.kind === "delivery" ? contact.shopifyLocationId : null
        }))
        .parse(data)
      if (!contactKindsFor(s.org.kind).includes(input.kind)) {
        throw new Error(
          s.org.kind === "supplier"
            ? "Supplier workspaces can save pickup addresses only"
            : "Save delivery addresses here. Forwarders' addresses are on the Forwarders page"
        )
      }
      await db()
        .insert(contacts)
        .values({ orgId: s.org.id, ...input })
      return Response.json({ ok: true })
    }
    if (action === "workspace.timeZone") {
      requireOwner(s)
      // An empty choice goes back to each viewer's computer's time zone.
      const input = z
        .object({ timeZone: z.union([z.literal(""), z.string().refine(isTimeZone, "Choose a time zone")]) })
        .parse(data)
      await db()
        .update(organizations)
        .set({ timeZone: input.timeZone || null })
        .where(eq(organizations.id, s.org.id))
      return Response.json({ ok: true })
    }
    if (action === "workspace.restock") {
      requireOwner(s)
      // The sales period and default lead time Restock starts from and the Overview uses.
      const days = z.number().int().min(dayRange.min).max(dayRange.max)
      const input = z.object({ salesDays: days, leadTimeDays: days }).parse(data)
      await db()
        .update(organizations)
        .set({ restockSalesDays: input.salesDays, restockLeadTimeDays: input.leadTimeDays })
        .where(eq(organizations.id, s.org.id))
      return Response.json({ ok: true })
    }
    if (action === "workspace.excludedShopifyTags") {
      requireOwner(s)
      if (s.org.kind !== "buyer") {
        throw new Error("A buyer workspace is required")
      }
      const input = z.object({ tags: z.array(z.string().trim().min(1).max(255)).max(50) }).parse(data)
      // Shopify compares tags without regard to case, so the first spelling of each is kept.
      const seen = new Set<string>()
      const tags = input.tags.filter((tag) => !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()))
      await db().update(organizations).set({ excludedShopifyTags: tags }).where(eq(organizations.id, s.org.id))
      return Response.json({ ok: true })
    }
    if (action === "supplier.profile") {
      if (s.org.kind !== "supplier") {
        throw new Error("A supplier workspace is required")
      }
      requireOwner(s)
      // The supplier's own contact details, which their buyers see.
      const parsed = supplierContactSchema.parse(data)
      const profile = {
        website: parsed.website ?? null,
        phoneNumber: parsed.phoneNumber ?? null,
        contactName: parsed.contactName ?? null,
        contactEmail: parsed.contactEmail ?? null
      }
      await db()
        .insert(supplierProfiles)
        .values({ orgId: s.org.id, ...profile })
        .onConflictDoUpdate({ target: supplierProfiles.orgId, set: { ...profile, updatedAt: new Date() } })
      return Response.json({ ok: true })
    }
    if (action === "contact.update") {
      const input = z
        .object({
          name: z.string().min(1).max(100),
          kind: z.enum(contactKinds),
          address: addressSchema,
          shopifyLocationId: z
            .string()
            .regex(/^gid:\/\/shopify\/Location\/\d+$/)
            .nullable()
            .default(null)
        })
        .transform((contact) => ({
          ...contact,
          shopifyLocationId: contact.kind === "delivery" ? contact.shopifyLocationId : null
        }))
        .parse(data)
      if (!contactKindsFor(s.org.kind).includes(input.kind)) {
        throw new Error(
          s.org.kind === "supplier"
            ? "Supplier workspaces can save pickup addresses only"
            : "Save delivery addresses here. Forwarders' addresses are on the Forwarders page"
        )
      }
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
    if (action === "connection.amazonSelfAuthorized") {
      requireOwner(s)
      requireBuyer(s)
      const connected = await connectAmazonSelfAuthorized(s.org.id, data)
      await queueAmazonSubscription(s.org.id, randomUUID())
      return Response.json({ ok: true, ...connected })
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
    if (action === "order.update") {
      const input = z.object({ id: z.uuid(), revision: z.number().int().positive(), order: z.unknown() }).parse(data)
      await updateDraftOrder(s, input.id, input.order, input.revision)
      return Response.json({ redirect: `/orders/${input.id}` })
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
      const fba = shipment.amazonNetwork === "fba"
      const amazonOrderId = z
        .string()
        .trim()
        .regex(fba ? /^wf[0-9a-f-]{36}$/ : /^STAR-[A-Z0-9]+$/)
        .parse(data.amazonOrderId)
      if (shipment.amazonOrderId && shipment.amazonOrderId !== amazonOrderId) {
        throw new Error("This shipment is already linked to a different Amazon order")
      }
      const api = await amazonFor(s.org.id, order.amazonSellerId)
      const reference = (fba ? fbaPlanName : amazonReference)(shipment.id, shipment.revision)
      const found = fba ? (await api.fbaPlan(amazonOrderId)).name : (await api.order(amazonOrderId)).externalReferenceId
      if (found !== reference) {
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
    if (action === "shipment.cancelAmazon") {
      requireBuyer(s)
      const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id()))
      if (!shipment?.amazonOrderId || shipment.status !== "correction") {
        throw new Error("An existing Amazon shipment must be in correction before replacement")
      }
      const { order } = await accessibleOrder(s, shipment.orderId)
      // Amazon cancels an AWD order at once and an FBA inbound plan in the background, so a plan may need a moment.
      if (!(await cancelAmazonShipment(await amazonFor(s.org.id, order.amazonSellerId), shipment))) {
        throw new Error("Amazon is still cancelling this shipment. Try again in a minute")
      }
      await db()
        .update(shipments)
        .set({ status: "cancelled", issue: null })
        .where(
          and(
            eq(shipments.id, shipment.id),
            eq(shipments.revision, shipment.revision),
            eq(shipments.status, "correction")
          )
        )
      await db()
        .insert(events)
        .values({ orderId: shipment.orderId, actor: s.user.id, message: "Amazon shipment cancelled" })
      return Response.json({ ok: true })
    }
    if (action === "shipment.received") {
      await receiveShipment(s, id())
      return Response.json({ ok: true })
    }
    if (action === "landedCost.create") {
      return Response.json(await addLandedCost(s, data))
    }
    if (action === "landedCost.delete") {
      await removeLandedCost(s, id())
      return Response.json({ ok: true })
    }
    if (action === "monthlyCost.create") {
      return Response.json(await addMonthlyCost(s, data))
    }
    if (action === "monthlyCost.delete") {
      await removeMonthlyCost(s, id())
      return Response.json({ ok: true })
    }
    if (action === "order.delete") {
      await deleteDraftOrder(s, id())
      return Response.json({ redirect: "/orders" })
    }
    if (action === "profile.update") {
      return Response.json(await saveProfile(s, data))
    }
    if (action === "order.comment") {
      return Response.json(await addComment(s, data))
    }
    if (action === "order.close") {
      await closeOrder(s, id())
      return Response.json({ ok: true })
    }
    if (action === "shipment.ship") {
      await shipShipment(s, id())
      return Response.json({ ok: true })
    }
    if (action === "shipment.forward") {
      await forwardShipment(s, data)
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
      const [released] = await db().select({ orderId: shipments.orderId }).from(shipments).where(eq(shipments.id, id()))
      const missingLabels = released ? await linesMissingLabels(s, released.orderId) : new Set<string>()
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
        const issues = releaseIssues(shipment, docs, missingLabels)
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
