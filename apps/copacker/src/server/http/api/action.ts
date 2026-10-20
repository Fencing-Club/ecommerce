import { randomUUID } from "node:crypto"
import { addressSchema } from "@repo/aisle"
import { canConfigureTransport, transportSchema } from "@repo/aisle/transport"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import {
  organizations,
  suppliers,
  contacts,
  jobs,
  shipments,
  documents,
  events,
  profiles,
  supplierProfiles
} from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { locales } from "@/i18n/locales"
import { contactKinds, contactKindsFor } from "@/lib/contacts"
import { isTimeZone } from "@/lib/time-zone"
import { eventMessage } from "@/lib/timeline-events"
import { accessibleOrder } from "@/server/access"
import { queueAmazonSubscription } from "@/server/amazon-notifications"
import { identity, session, setWorkspace } from "@/server/auth"
import { signInRequest } from "@/server/auth-session"
import { requireAccess, requireAdmin, requireBuyer, requireOwner } from "@/server/authorization"
import { linkExistingAwd } from "@/server/awd-link"
import { addComment } from "@/server/comments"
import { amazonFor, disconnect, connectAmazonSelfAuthorized } from "@/server/connections"
import { deleteAccount, deleteWorkspace } from "@/server/deletion"
import { errorResponse, failureMessage, failureStatus } from "@/server/errors"
import { amazonReference, cancelAmazonShipment, fbaPlanName } from "@/server/fba-shipments"
import { startFirstSync } from "@/server/first-sync"
import {
  createForwarder,
  inviteForwarder,
  removeForwarder,
  renameForwarder,
  saveForwarderAddress
} from "@/server/forwarders"
import { withJobWake } from "@/server/job-delivery"
import { addLandedCost, removeLandedCost } from "@/server/landed-costs"
import { requestLocale } from "@/server/localization"
import { addMonthlyCost, removeMonthlyCost } from "@/server/monthly-costs"
import { joinWorkspace, setUpWorkspace } from "@/server/onboarding"
import {
  createOrder,
  updateDraftOrder,
  submitOrder,
  newShipment,
  submitPacking,
  prepareAmazonShipment,
  approveInvoice,
  correctShipment,
  reopenPacking,
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
import { token, hash, isAppOrigin } from "@/server/security"
import { forwardShipment, shipShipment } from "@/server/shipment-legs"
import { signInActions } from "@/server/sign-in-actions"
import { removeSupplierAddress, saveSupplierAddress } from "@/server/supplier-addresses"
import { removeSupplier, supplierContactSchema, updateSupplier } from "@/server/suppliers"
import {
  cancelInvitation,
  changeAccess,
  inviteColleague,
  removeColleague,
  resendInvitation,
  transferOwnership
} from "@/server/team"
import { serverText } from "@/server/text"
import { requireMembership } from "@/server/workspace-session"

const inputSchema = z.object({ action: z.string(), data: z.record(z.string(), z.unknown()) })
export async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  try {
    const { action, data } = inputSchema.parse(await request.json())
    // Signing in and up, before anyone is signed in.
    const signInAction = signInActions.get(action)
    if (signInAction) {
      return Response.json(await signInAction(await signInRequest(), data))
    }
    // Resolve the profile language before a domain transaction holds a connection. A lazy lookup from inside that
    // transaction needs another connection and can deadlock a small Hyperdrive pool under concurrent submissions.
    await requestLocale()
    // Getting started: signed in, but maybe without a workspace yet.
    if (action === "onboarding.workspace") {
      return Response.json(await setUpWorkspace(await identity(), data))
    }
    if (action === "onboarding.join") {
      return Response.json(await joinWorkspace(await identity(), data))
    }
    // Recovery must not depend on a workspace that has disappeared.
    if (action === "workspace.switch") {
      const user = await identity("/workspaces")
      const workspaceId = z.uuid().parse(data.id)
      await requireMembership(user.id, workspaceId)
      setWorkspace(workspaceId)
      return Response.json({ redirect: "/" })
    }
    const s = await session()
    const id = () => z.uuid().parse(data.id),
      revision = () => z.number().int().positive().parse(data.revision)
    if (action === "team.invite") {
      requireAdmin(s)
      return Response.json(await inviteColleague(s.org, data))
    }
    if (action === "team.resend") {
      requireAdmin(s)
      return Response.json(await resendInvitation(s.org, data))
    }
    if (action === "team.transfer") {
      requireOwner(s)
      return Response.json(await transferOwnership(s, data))
    }
    if (action === "workspace.delete") {
      requireOwner(s)
      return Response.json(await deleteWorkspace(s.org, data))
    }
    // Anyone can delete their own account, once the workspaces they own that others use have a new owner.
    if (action === "account.delete") {
      return Response.json(await deleteAccount(s.user, data))
    }
    if (action === "team.access") {
      requireAdmin(s)
      return Response.json(await changeAccess(s, data))
    }
    if (action === "team.cancel") {
      requireAdmin(s)
      return Response.json(await cancelInvitation(s.org.id, data))
    }
    if (action === "team.remove") {
      requireAdmin(s)
      return Response.json(await removeColleague(s, data))
    }
    if (action === "supplier.create") {
      requireBuyer(s)
      requireAccess(s, "partners", "edit")
      // The email is optional: a supplier can get POs without joining Copacker, and is invited once it has one.
      const input = z
        .object({
          name: z.string().trim().min(2).max(120),
          email: z
            .union([z.email().max(254), z.literal("")])
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
        throw new LocalizedError("supplierAlreadyAdded", { name: input.name })
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
        await withJobWake(
          db()
            .insert(jobs)
            .values({
              key: `invite:${supplier!.id}:${randomUUID()}`,
              kind: "email",
              payload: { type: "invite", to: input.email, name: s.org.name, invitation, locale: await requestLocale() }
            })
        )
      }
      return Response.json({ id: supplier!.id })
    }
    // Invites a supplier that hasn't joined, or sends its invitation again; an email given here replaces the saved one.
    if (action === "supplier.invite" || action === "supplier.resend") {
      requireBuyer(s)
      requireAccess(s, "partners", "edit")
      const email = z
        .union([z.email().max(254), z.literal("")])
        .optional()
        .transform((v) => v?.toLowerCase() || null)
        .parse(data.email)
      // A fresh token replaces the old one, so earlier invitation links stop working.
      const invitation = token()
      await withJobWake(
        db().transaction(async (tx) => {
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
            throw new LocalizedError("supplierJoinedOrRemoved")
          }
          if (!supplier.email) {
            throw new LocalizedError("enterSupplierEmail")
          }
          // Each send is its own job: the job key doubles as the email provider's idempotency key, which rejects a
          // reused key carrying a different invitation.
          await tx.insert(jobs).values({
            key: `invite:${supplier.id}:${randomUUID()}`,
            kind: "email",
            payload: { type: "invite", to: supplier.email, name: s.org.name, invitation, locale: await requestLocale() }
          })
        })
      )
      return Response.json({ ok: true })
    }
    if (action === "supplier.remove") {
      requireBuyer(s)
      requireAccess(s, "partners", "edit")
      await removeSupplier(s.org.id, id())
      return Response.json({ ok: true })
    }
    if (action === "supplier.update") {
      requireBuyer(s)
      requireAccess(s, "partners", "edit")
      await updateSupplier(s.org.id, data)
      return Response.json({ ok: true })
    }
    if (action === "forwarder.create") {
      requireBuyer(s)
      requireAccess(s, "partners", "edit")
      const forwarder = await createForwarder(s.org, data)
      return Response.json({ id: forwarder.id })
    }
    if (action === "forwarder.rename") {
      requireBuyer(s)
      requireAccess(s, "partners", "edit")
      await renameForwarder(s.org.id, id(), data)
      return Response.json({ ok: true })
    }
    if (action === "forwarder.remove") {
      requireBuyer(s)
      requireAccess(s, "partners", "edit")
      await removeForwarder(s.org.id, id())
      return Response.json({ ok: true })
    }
    if (action === "forwarder.invite") {
      requireBuyer(s)
      requireAccess(s, "partners", "edit")
      await inviteForwarder(s.org, id(), data.email)
      return Response.json({ ok: true })
    }
    if (action === "forwarder.address") {
      requireBuyer(s)
      requireAccess(s, "partners", "edit")
      await saveForwarderAddress(s.org.id, data)
      return Response.json({ ok: true })
    }
    // Adds or edits a pickup address for a supplier that hasn't joined, or with `remove`, deletes it.
    if (action === "supplier.address") {
      requireBuyer(s)
      requireAccess(s, "partners", "edit")
      return Response.json(await (data.remove === true ? removeSupplierAddress : saveSupplierAddress)(s.org.id, data))
    }
    if (action === "contact.create") {
      requireAdmin(s)
      const input = z
        .object({
          name: z.string().trim().min(1).max(100),
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
        throw new LocalizedError(
          s.org.kind === "supplier" ? "supplierPickupAddressesOnly" : "saveDeliveryAddressesHere"
        )
      }
      await db()
        .insert(contacts)
        .values({ orgId: s.org.id, ...input })
      return Response.json({ ok: true })
    }
    if (action === "workspace.timeZone") {
      requireAdmin(s)
      // An empty choice goes back to each viewer's computer's time zone.
      const input = z
        .object({ timeZone: z.union([z.literal(""), z.string().refine(isTimeZone, "errors.chooseTimeZone")]) })
        .parse(data)
      await db()
        .update(organizations)
        .set({ timeZone: input.timeZone || null })
        .where(eq(organizations.id, s.org.id))
      return Response.json({ ok: true })
    }
    if (action === "workspace.restock") {
      requireAdmin(s)
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
      requireAdmin(s)
      if (s.org.kind !== "buyer") {
        throw new LocalizedError("buyerWorkspaceRequired")
      }
      const input = z.object({ tags: z.array(z.string().trim().min(1).max(255)).max(50) }).parse(data)
      // Shopify compares tags without regard to case, so the first spelling of each is kept.
      const seen = new Set<string>()
      const tags = input.tags.filter((tag) => !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()))
      await db().update(organizations).set({ excludedShopifyTags: tags }).where(eq(organizations.id, s.org.id))
      return Response.json({ ok: true })
    }
    if (action === "supplier.profile") {
      requireAdmin(s)
      if (s.org.kind !== "supplier") {
        throw new LocalizedError("supplierWorkspaceRequired")
      }
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
      requireAdmin(s)
      const input = z
        .object({
          name: z.string().trim().min(1).max(100),
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
        throw new LocalizedError(
          s.org.kind === "supplier" ? "supplierPickupAddressesOnly" : "saveDeliveryAddressesHere"
        )
      }
      // Only the workspace's own addresses: a partner's addresses change through the partner's actions, which need
      // Partners access.
      const updated = await db()
        .update(contacts)
        .set(input)
        .where(
          and(
            eq(contacts.id, id()),
            eq(contacts.orgId, s.org.id),
            isNull(contacts.supplierId),
            isNull(contacts.forwarderId)
          )
        )
        .returning({ id: contacts.id })
      if (!updated.length) {
        return errorResponse("addressRemovedRefresh", 404)
      }
      return Response.json({ ok: true })
    }
    if (action === "connection.amazonSelfAuthorized") {
      requireAdmin(s)
      requireBuyer(s)
      const connected = await connectAmazonSelfAuthorized(s.org.id, data)
      await queueAmazonSubscription(s.org.id, randomUUID())
      await startFirstSync(s.org, "amazon")
      return Response.json({ ok: true, ...connected })
    }
    if (action === "connection.delete") {
      requireAdmin(s)
      requireBuyer(s)
      const provider = z.enum(["amazon", "shopify", "ebay"]).parse(data.provider)
      return Response.json({ ok: true, ...(await disconnect(s.org.id, provider)) })
    }
    if (action === "contact.delete") {
      requireAdmin(s)
      const deleted = await db()
        .delete(contacts)
        .where(
          and(
            eq(contacts.id, id()),
            eq(contacts.orgId, s.org.id),
            isNull(contacts.supplierId),
            isNull(contacts.forwarderId)
          )
        )
        .returning({ id: contacts.id })
      if (!deleted.length) {
        return errorResponse("addressAlreadyRemoved", 404)
      }
      return Response.json({ ok: true })
    }
    if (action === "order.create") {
      requireAccess(s, "orders", "edit")
      const order = await createOrder(s, data)
      return Response.json({ redirect: `/orders/${order.id}` })
    }
    if (action === "order.update") {
      requireAccess(s, "orders", "edit")
      const input = z.object({ id: z.uuid(), revision: z.number().int().positive(), order: z.unknown() }).parse(data)
      await updateDraftOrder(s, input.id, input.order, input.revision)
      return Response.json({ redirect: `/orders/${input.id}` })
    }
    if (action === "order.submit") {
      requireAccess(s, "orders", "edit")
      return Response.json({ ok: true, ...(await submitOrder(s, id(), revision())) })
    }
    if (action === "shipment.create") {
      requireAccess(s, "shipments", "edit")
      const shipment = await newShipment(s, id())
      return Response.json({ redirect: `/shipments/${shipment.id}` })
    }
    if (action === "shipment.linkExisting") {
      requireAccess(s, "shipments", "edit")
      return Response.json(await linkExistingAwd(s, id(), revision(), data.amazonShipmentId))
    }
    if (action === "shipment.save") {
      requireAccess(s, "shipments", "edit")
      return Response.json(
        await savePacking(s, id(), data.draft, revision(), z.number().int().positive().parse(data.orderRevision))
      )
    }
    if (action === "shipment.check") {
      requireAccess(s, "shipments", "edit")
      return Response.json(await checkPacking(s, id(), data.packing))
    }
    if (action === "shipment.submit") {
      requireAccess(s, "shipments", "edit")
      return Response.json(await submitPacking(s, id(), data.packing, revision()))
    }
    if (action === "shipment.approve") {
      requireAccess(s, "shipments", "edit")
      // Approving a supplier's invoice accepts its prices.
      requireAccess(s, "prices")
      await approveInvoice(s, id(), revision(), z.boolean().parse(data.updateCost))
      return Response.json({ ok: true })
    }
    if (action === "shipment.prepareAmazon") {
      requireAccess(s, "shipments", "edit")
      await prepareAmazonShipment(s, id(), revision())
      return Response.json({ ok: true })
    }
    if (action === "shipment.reopenPacking") {
      requireAccess(s, "shipments", "edit")
      await reopenPacking(s, id(), revision())
      return Response.json({ ok: true })
    }
    if (action === "shipment.correct") {
      requireAccess(s, "shipments", "edit")
      await correctShipment(s, id(), z.string().parse(data.reason))
      return Response.json({ ok: true })
    }
    if (action === "shipment.retry") {
      requireBuyer(s)
      requireAccess(s, "shipments", "edit")
      await withJobWake(
        db().transaction(async (tx) => {
          const [initial] = await tx.select().from(shipments).where(eq(shipments.id, id()))
          if (!initial) {
            throw new LocalizedError("shipmentNotFound")
          }
          await accessibleOrder(s, initial.orderId, tx, true)
          const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, id())).for("update")
          if (
            !shipment ||
            shipment.status !== "needs_attention" ||
            shipment.operation === "sending" ||
            shipment.revision !== revision()
          ) {
            throw new LocalizedError("reconcileBeforeRetry")
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
      )
      return Response.json({ ok: true })
    }
    if (action === "shipment.reconcile") {
      requireBuyer(s)
      requireAccess(s, "shipments", "edit")
      const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id()))
      if (!shipment?.snapshot || !shipment.packing || !["needs_attention", "correction"].includes(shipment.status)) {
        throw new LocalizedError("shipmentNotAwaitingReconciliation")
      }
      const { order } = await accessibleOrder(s, shipment.orderId)
      const fba = shipment.amazonNetwork === "fba"
      const amazonOrderId = z
        .string()
        .trim()
        .regex(fba ? /^wf[0-9a-f-]{36}$/ : /^STAR-[A-Z0-9]+$/)
        .parse(data.amazonOrderId)
      if (shipment.amazonOrderId && shipment.amazonOrderId !== amazonOrderId) {
        throw new LocalizedError("shipmentLinkedToOtherAmazonOrder")
      }
      const api = await amazonFor(s.org.id, order.amazonSellerId)
      const reference = (fba ? fbaPlanName : amazonReference)(shipment.id, shipment.revision)
      const found = fba ? (await api.fbaPlan(amazonOrderId)).name : (await api.order(amazonOrderId)).externalReferenceId
      if (found !== reference) {
        throw new LocalizedError("amazonOrderNotForShipment")
      }
      if (order.buyerOrgId !== s.org.id) {
        throw new Error("Account mismatch")
      }
      await withJobWake(
        db().transaction(async (tx) => {
          const [current] = await tx.select().from(shipments).where(eq(shipments.id, shipment.id)).for("update")
          if (current?.revision !== shipment.revision || current?.status !== shipment.status) {
            throw new LocalizedError("shipmentChangedWhileReconciling")
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
      )
      return Response.json({ ok: true })
    }
    if (action === "shipment.cancelAmazon") {
      requireBuyer(s)
      requireAccess(s, "shipments", "edit")
      const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id()))
      if (!shipment?.amazonOrderId || shipment.linkedAmazonShipmentId || shipment.status !== "correction") {
        throw new LocalizedError("amazonShipmentNotInCorrection")
      }
      const { order } = await accessibleOrder(s, shipment.orderId)
      // Amazon cancels an AWD order at once and an FBA inbound plan in the background, so a plan may need a moment.
      if (!(await cancelAmazonShipment(await amazonFor(s.org.id, order.amazonSellerId), shipment))) {
        throw new LocalizedError("amazonStillCancelling")
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
        .values({
          orderId: shipment.orderId,
          actor: s.user.id,
          ...eventMessage({ key: "amazonShipmentCancelled", values: null })
        })
      return Response.json({ ok: true })
    }
    if (action === "shipment.received") {
      requireAccess(s, "shipments", "edit")
      await receiveShipment(s, id())
      return Response.json({ ok: true })
    }
    if (action === "landedCost.create") {
      requireAccess(s, "orders", "edit")
      return Response.json(await addLandedCost(s, data))
    }
    if (action === "landedCost.delete") {
      requireAccess(s, "orders", "edit")
      await removeLandedCost(s, id())
      return Response.json({ ok: true })
    }
    if (action === "monthlyCost.create") {
      requireAdmin(s)
      return Response.json(await addMonthlyCost(s, data))
    }
    if (action === "monthlyCost.delete") {
      requireAdmin(s)
      await removeMonthlyCost(s, id())
      return Response.json({ ok: true })
    }
    if (action === "order.delete") {
      requireAccess(s, "orders", "edit")
      await deleteDraftOrder(s, id())
      return Response.json({ redirect: "/orders" })
    }
    if (action === "profile.locale") {
      // An empty choice goes back to the computer's language.
      const input = z.object({ locale: z.union([z.literal(""), z.enum(locales)]) }).parse(data)
      await db()
        .update(profiles)
        .set({ locale: input.locale || null, updatedAt: new Date() })
        .where(eq(profiles.userId, s.user.id))
      return Response.json({ ok: true })
    }
    if (action === "profile.update") {
      return Response.json(await saveProfile(s, data))
    }
    if (action === "order.comment") {
      requireAccess(s, "orders", "view")
      return Response.json(await addComment(s, data))
    }
    if (action === "order.close") {
      requireAccess(s, "orders", "edit")
      await closeOrder(s, id())
      return Response.json({ ok: true })
    }
    if (action === "shipment.ship") {
      requireAccess(s, "shipments", "edit")
      await shipShipment(s, id())
      return Response.json({ ok: true })
    }
    if (action === "shipment.forward") {
      requireAccess(s, s.org.kind === "forwarder" ? "orders" : "shipments", "edit")
      // The buyer records the forwarder's freight cost, so it needs prices; a forwarder enters its own charge.
      if (s.org.kind !== "forwarder") {
        requireAccess(s, "prices")
      }
      await forwardShipment(s, data)
      return Response.json({ ok: true })
    }
    if (action === "job.retry") {
      requireBuyer(s)
      requireAdmin(s)
      const [job] = await db().select().from(jobs).where(eq(jobs.id, id()))
      if (!job || job.kind === "amazon" || job.status !== "failed") {
        throw new LocalizedError("jobCannotBeRetried")
      }
      const orderId = z.uuid().parse(job.payload.orderId)
      await accessibleOrder(s, orderId)
      await withJobWake(
        db().update(jobs).set({ status: "pending", runAt: new Date(), error: null }).where(eq(jobs.id, id()))
      )
      return Response.json({ ok: true })
    }
    if (action === "shipment.transport") {
      requireBuyer(s)
      requireAccess(s, "shipments", "edit")
      const transport = transportSchema.parse(data.transport)
      const expected = transportSchema.nullable().parse(data.expected)
      await db().transaction(async (tx) => {
        const [initial] = await tx.select().from(shipments).where(eq(shipments.id, id()))
        if (!initial) {
          throw new LocalizedError("shipmentNotFound")
        }
        const { order } = await accessibleOrder(s, initial.orderId, tx, true)
        const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, id())).for("update")
        if (
          !shipment ||
          !canConfigureTransport(shipment.status, shipment.operation, shipment.transport) ||
          shipment.revision !== revision() ||
          JSON.stringify(shipment.transport && transportSchema.parse(shipment.transport)) !== JSON.stringify(expected)
        ) {
          throw new LocalizedError("transportChanged")
        }
        if (transport.handoff === "forwarder" && !(shipment.snapshot ?? order.data).via) {
          throw new LocalizedError("transportForwarderMissing")
        }
        await tx.update(shipments).set({ transport, updatedAt: new Date() }).where(eq(shipments.id, id()))
      })
      return Response.json({ ok: true })
    }
    if (action === "shipment.release") {
      requireAccess(s, "shipments", "edit")
      const [released] = await db().select({ orderId: shipments.orderId }).from(shipments).where(eq(shipments.id, id()))
      const missingLabels = released ? await linesMissingLabels(s, released.orderId) : new Set<string>()
      requireBuyer(s)
      await withJobWake(
        db().transaction(async (tx) => {
          const [initial] = await tx.select().from(shipments).where(eq(shipments.id, id()))
          if (!initial) {
            throw new LocalizedError("shipmentNotFound")
          }
          const { supplier } = await accessibleOrder(s, initial.orderId, tx, true)
          const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, id())).for("update")
          if (
            !shipment?.packing ||
            !shipment.snapshot ||
            shipment.status !== "waiting_labels" ||
            shipment.revision !== revision()
          ) {
            throw new LocalizedError("shipmentNotReadyForRelease")
          }
          const docs = await tx
            .select()
            .from(documents)
            .where(and(eq(documents.orderId, shipment.orderId), eq(documents.outdated, 0)))
          const issues = releaseIssues(shipment, docs, missingLabels, await serverText())
          if (issues.length) {
            throw new Error(issues.map((issue) => issue.message).join("\n"))
          }
          await tx
            .update(shipments)
            .set({
              status: "ready",
              bookingReference: z.string().trim().max(100).optional().parse(data.bookingReference) || null
            })
            .where(eq(shipments.id, id()))
          // Only a supplier that joined Copacker is emailed that its labels are ready, since the email links to the
          // shipment in its workspace. For one that hasn't, the buyer downloads the packet and shares it, as it does the
          // purchase order's documents.
          if (supplier.supplierOrgId && supplier.email) {
            await tx
              .insert(jobs)
              .values({
                key: `ready:${shipment.id}:${shipment.revision}`,
                kind: "email",
                payload: { type: "ready", to: supplier.email, orderId: shipment.orderId, shipmentId: shipment.id }
              })
              .onConflictDoNothing()
          }
          await tx.insert(events).values({
            orderId: shipment.orderId,
            actor: s.user.id,
            ...eventMessage({ key: supplier.supplierOrgId ? "labelsReleased" : "labelsReleasedToShare", values: null })
          })
        })
      )
      return Response.json({ ok: true })
    }
    throw new Error("Unknown action")
  } catch (error) {
    return Response.json({ error: await failureMessage(error) }, { status: failureStatus(error) })
  }
}
