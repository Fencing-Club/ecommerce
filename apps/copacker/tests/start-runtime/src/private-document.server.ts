import { randomUUID } from "node:crypto"
import type { OrderInput } from "@repo/copacker-orders"
import { env } from "cloudflare:workers"
import { eq, sql } from "drizzle-orm"
import { PDFDocument } from "pdf-lib"
import invariant from "tiny-invariant"
import { match } from "ts-pattern"
import { z } from "zod"
import { db, withDatabase } from "@/db"
import { documents, forwarders, memberships, orders, organizations, shipments, suppliers } from "@/db/schema"
import { AccessError, LocalizedError, NotFoundError } from "@/i18n/errors"
import { authentication } from "@/server/auth-session"
import { downloadDocument } from "@/server/document-download"
import { errorTextResponse, failureMessage } from "@/server/errors"
import { deleteFile, getFile, putFile, r2FileStorage, readFile, withFileStorage } from "@/server/storage"
import { workspaceSession } from "@/server/workspace-session"

export async function storageProbe() {
  const key = `compatibility/${randomUUID()}/round-trip.txt`
  const bytes = new TextEncoder().encode("Private R2 compatibility file")
  return withFileStorage(r2FileStorage(env.DOCUMENTS), async () => {
    try {
      await putFile(key, bytes, "text/plain; charset=utf-8")
      const file = await readFile(key)
      invariant(file.contentType === "text/plain; charset=utf-8" && file.size === bytes.length, "Metadata changed")
      invariant((await new Response(file.body).text()) === "Private R2 compatibility file", "Stream changed")
      invariant(Buffer.from(await getFile(key)).equals(bytes), "Processor bytes changed")
      await deleteFile(key)
      invariant((await env.DOCUMENTS.get(key)) === null, "Deleted file remains accessible")
      return Response.json({ privateStorage: true, metadata: true, streamed: true, processor: true, deleted: true })
    } finally {
      await deleteFile(key)
    }
  })
}

const scenario = z.enum([
  "supplier",
  "buyer",
  "forwarder",
  "foreign",
  "draft",
  "unreleased",
  "wrong-revision",
  "hidden-kind",
  "outdated",
  "replaced",
  "withdrawn",
  "removed-supplier",
  "removed-membership",
  "revoked-page",
  "revoked-prices"
])

// Real authentication and R2, with only transaction-local copies of the schema. No application rows are read or
// changed. Each run owns one random object and removes it even if its authorization check fails.
export async function privateDocumentProbe(request: Request) {
  const { user } = await authentication()
  if (!user) {
    return new Response(null, { status: 401 })
  }
  const parsed = scenario.safeParse(new URL(request.url).searchParams.get("case"))
  if (!parsed.success) {
    return new Response(null, { status: 400 })
  }
  const which = parsed.data
  const key = `compatibility/${randomUUID()}/document.pdf`
  const files = r2FileStorage(env.DOCUMENTS)
  return withFileStorage(files, async () => {
    try {
      const pdf = await PDFDocument.create()
      pdf.addPage()
      pdf.setTitle("Private document compatibility")
      const bytes = await pdf.save()
      await putFile(key, bytes)
      return await withDatabase({ connectionString: env.HYPERDRIVE.connectionString }, () =>
        db().transaction(async (tx) => {
          for (const name of [
            "organizations",
            "memberships",
            "profiles",
            "suppliers",
            "forwarders",
            "orders",
            "shipments",
            "documents"
          ]) {
            await tx.execute(
              sql`create temporary table ${sql.identifier(name)} (like public.${sql.identifier(name)} including all) on commit drop`
            )
          }
          await tx.execute(sql`set local search_path = pg_temp, public`)
          const buyer = randomUUID(),
            supplier = randomUUID(),
            forwarder = randomUUID(),
            foreign = randomUUID()
          const supplierLink = randomUUID(),
            forwarderLink = randomUUID(),
            order = randomUUID(),
            shipment = randomUUID(),
            document = randomUUID()
          await tx.insert(organizations).values([
            { id: buyer, name: "Probe buyer", kind: "buyer" },
            { id: supplier, name: "Probe supplier", kind: "supplier" },
            { id: forwarder, name: "Probe forwarder", kind: "forwarder" },
            { id: foreign, name: "Probe other workspace", kind: "buyer" }
          ])
          const active = match(which)
            .with("buyer", () => buyer)
            .with("foreign", () => foreign)
            .with("forwarder", "hidden-kind", () => forwarder)
            .otherwise(() => supplier)
          await tx.insert(memberships).values({
            orgId: active,
            userId: user.id,
            email: user.email,
            role: "member",
            access: { orders: "view", shipments: "view", prices: "view" }
          })
          await tx
            .insert(suppliers)
            .values({ id: supplierLink, buyerOrgId: buyer, supplierOrgId: supplier, name: "Probe supplier" })
          await tx
            .insert(forwarders)
            .values({ id: forwarderLink, buyerOrgId: buyer, forwarderOrgId: forwarder, name: "Probe forwarder" })
          const data: OrderInput = {
            supplierId: supplierLink,
            reference: "Probe PO",
            deliveryId: randomUUID(),
            currency: "USD",
            paymentTerms: "Net 30",
            notes: "",
            items: [],
            via: { forwarderId: forwarderLink, addressId: randomUUID() }
          }
          await tx.insert(orders).values({
            id: order,
            buyerOrgId: buyer,
            supplierId: supplierLink,
            shopifyDomain: "probe.invalid",
            status: which === "draft" ? "draft" : "submitted",
            data
          })
          await tx.insert(shipments).values({
            id: shipment,
            orderId: order,
            orderRevision: 1,
            revision: which === "wrong-revision" ? 2 : 1,
            status: which === "unreleased" ? "packing" : "ready"
          })
          await tx.insert(documents).values({
            id: document,
            orderId: order,
            shipmentId: shipment,
            kind: match(which)
              .returnType<typeof documents.$inferInsert.kind>()
              .with("hidden-kind", () => "product_label")
              .with("revoked-prices", () => "invoice")
              .otherwise(() => "shipping_label"),
            objectKey: key,
            name: "Private label.pdf",
            bytes: bytes.length,
            orderRevision: 1,
            shipmentRevision: 1,
            uploadedBy: "probe",
            outdated: which === "outdated" ? 1 : 0
          })
          const session = await workspaceSession(user, active, tx)
          invariant(session, "Probe membership is missing")
          return withFileStorage(
            {
              ...files,
              async get(objectKey) {
                const file = await files.get(objectKey)
                if (which === "replaced") {
                  await tx
                    .update(documents)
                    .set({ objectKey: `${key}.replaced` })
                    .where(eq(documents.id, document))
                } else if (which === "withdrawn") {
                  await tx
                    .update(shipments)
                    .set({ status: "correction", revision: 2 })
                    .where(eq(shipments.id, shipment))
                } else if (which === "removed-supplier") {
                  await tx.update(suppliers).set({ removedAt: new Date() }).where(eq(suppliers.id, supplierLink))
                } else if (which === "removed-membership") {
                  await tx.delete(memberships).where(eq(memberships.userId, user.id))
                } else if (which === "revoked-page" || which === "revoked-prices") {
                  await tx
                    .update(memberships)
                    .set({ access: which === "revoked-page" ? { prices: "view" } : { shipments: "view" } })
                    .where(eq(memberships.userId, user.id))
                }
                return file
              }
            },
            () => downloadDocument(session, document, tx)
          )
        })
      )
    } catch (error) {
      if (error instanceof NotFoundError) {
        return errorTextResponse("documentNotFound", 404)
      }
      if (error instanceof AccessError || (error instanceof LocalizedError && error.key === "workspaceAccessDenied")) {
        return new Response(await failureMessage(error), { status: 403 })
      }
      throw error
    } finally {
      // R2's get has acquired the object stream; removing the stored key does not expose a public download URL.
      await deleteFile(key)
    }
  })
}
