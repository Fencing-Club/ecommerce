import type { Email } from "@repo/copacker-emails"
import {
  customerDataRequestEmail,
  invitationEmail,
  labelsReadyEmail,
  purchaseOrderEmail,
  shownLines
} from "@repo/copacker-emails"
import { variantName } from "@repo/copacker-marketplaces/shopify"
import { money, orderTotal } from "@repo/copacker-orders"
import { and, eq, sql } from "drizzle-orm"
import { match, P } from "ts-pattern"
import { db } from "../db/index"
import { shipments, orders, orderRevisions, organizations, memberships, profiles } from "../db/schema"
import type { Locale } from "../i18n/locales"
import { defaultLocale, isLocale } from "../i18n/locales"
import { translatorFor } from "../i18n/translator"
import { filedPo, shipmentDestination } from "./documents"
import { sendEmail } from "./email"
import { emailConfig } from "./integration-config"
import type { JobInput } from "./job-payloads"
import type { JobContext } from "./job-runtime"
import { appUrl } from "./security"

type EmailInput<T extends JobInput<"email">["type"]> = Extract<JobInput<"email">, { type: T }>
type Translator = Awaited<ReturnType<typeof translatorFor>>
type Written = { email: Email; attachments: Array<{ filename: string; content: string }> }

// Worker job: writes one email in its reader's language and sends it. The job's key is the email provider's
// idempotency key, so a retry doesn't deliver it twice.
export async function emailJob(
  input: JobInput<"email">,
  { key, assertOwned }: Pick<JobContext, "key" | "assertOwned">
) {
  if (!emailConfig()) {
    throw new Error("Email sender is not configured")
  }
  const lang = await readerLocale(input.to, input.locale)
  const t = await translatorFor(lang)
  const { email, attachments } = await match(input)
    .with({ type: P.union("invite", "team", "forwarder") }, (invite) => invitation(invite, lang, t))
    .with({ type: "po" }, (po) => purchaseOrder(po, lang, t))
    .with({ type: "data_request" }, (request) => customerDataRequest(request, lang, t))
    .with({ type: "ready" }, (ready) => labelsReady(ready, lang, t))
    .exhaustive()
  await assertOwned()
  await sendEmail({ to: input.to, ...email, key, attachments })
}

// The language an email is written in: the one its reader chose in Settings, found by their address. A reader with an
// account who follows their computer's language gets English, since the worker can't know it. Someone without an
// account yet, such as an invited supplier, gets the language the email was queued in, such as the inviter's.
async function readerLocale(email: string, queued: string | undefined): Promise<Locale> {
  const accounts = await db()
    .select({ locale: profiles.locale })
    .from(memberships)
    .leftJoin(profiles, eq(profiles.userId, memberships.userId))
    .where(eq(sql`lower(${memberships.email})`, email.toLowerCase()))
  const chosen = accounts.map((account) => account.locale).find(isLocale)
  if (chosen) {
    return chosen
  }
  return !accounts.length && isLocale(queued) ? queued : defaultLocale
}

// The link's page signs the person up or in with this email, then sets up what's still missing.
async function invitation(
  input: EmailInput<"invite" | "team" | "forwarder">,
  lang: Locale,
  t: Translator
): Promise<Written> {
  const kind = input.type === "invite" ? "supplier" : input.type
  const from = input.name ?? (input.type === "team" ? t("emails.invitation.yourTeam") : t("emails.invitation.aBuyer"))
  const subject = t("emails.invitation.subject", { from })
  const lead = t(`emails.invitation.joining.${kind}`)
  const account = t("emails.invitation.steps.account")
  // What comes after accepting.
  const steps = {
    supplier: [
      account,
      t("emails.invitation.steps.supplierWorkspace"),
      t("emails.invitation.steps.supplierPack", { from })
    ],
    team: [account, t("emails.invitation.steps.teamStart", { from })],
    forwarder: [
      account,
      t("emails.invitation.steps.forwarderAddresses"),
      t("emails.invitation.steps.forwarderShipments", { from })
    ]
  }
  const email = await invitationEmail({
    appUrl: appUrl(),
    kind,
    token: input.invitation,
    lang,
    copy: {
      subject,
      eyebrow: t(`emails.invitation.eyebrow.${kind}`),
      heading: subject,
      lead,
      preview: lead,
      action: t("emails.invitation.accept"),
      note: t("emails.invitation.note", { email: input.to }),
      pasteLink: t("emails.pasteLink"),
      reason: t("emails.invitation.reason", { from, email: input.to }),
      tagline: t("emails.tagline"),
      steps: steps[kind]
    }
  })
  return { email, attachments: [] }
}

// The email says what the attached PDF does: that revision's lines, total, dates and ship-to, and the buyer.
async function purchaseOrder(input: EmailInput<"po">, lang: Locale, t: Translator): Promise<Written> {
  const po = await filedPo(input.orderId, input.revision)
  const [sent] = await db()
    .select({ order: orderRevisions.data, buyer: organizations.name })
    .from(orderRevisions)
    .innerJoin(orders, eq(orders.id, orderRevisions.orderId))
    .innerJoin(organizations, eq(organizations.id, orders.buyerOrgId))
    .where(and(eq(orderRevisions.orderId, input.orderId), eq(orderRevisions.revision, po.doc.orderRevision)))
  if (!sent) {
    throw new Error("Purchase order revision is unavailable")
  }
  const { order, buyer } = sent
  const { reference } = order
  const revision = po.doc.orderRevision
  const units = order.items.reduce((sum, item) => sum + item.pieces, 0)
  const total = money(orderTotal(order), order.currency)
  const values = { reference, buyer }
  const email = await purchaseOrderEmail({
    appUrl: appUrl(),
    orderId: input.orderId,
    revision,
    dueDate: order.dueDate,
    shipTo: po.shipTo,
    paymentTerms: order.paymentTerms || undefined,
    // The most valuable lines first, named as the PDF names them, without Shopify's "Default Title".
    items: order.items
      .toSorted((a, b) => b.pieces * b.unitPrice - a.pieces * a.unitPrice)
      .map((item) => ({
        quantity: item.pieces,
        name: item.name,
        detail: [variantName(item.variant), item.supplierSku].filter(Boolean).join(", "),
        amount: money(item.pieces * item.unitPrice, order.currency)
      })),
    total,
    lang,
    copy: {
      subject: t("emails.purchaseOrder.subject", values),
      eyebrow: revision > 1 ? t("emails.purchaseOrder.eyebrow.revised") : t("emails.purchaseOrder.eyebrow.new"),
      heading: t("emails.purchaseOrder.heading", values),
      // A later revision replaces the one the supplier had.
      lead:
        revision > 1
          ? t("emails.purchaseOrder.lead.revised", { buyer })
          : t("emails.purchaseOrder.lead.new", { buyer, units, products: order.items.length }),
      preview: order.dueDate
        ? t("emails.purchaseOrder.previewRequiredBy", { units, total, date: day(order.dueDate, lang) })
        : t("emails.purchaseOrder.preview", { units, total }),
      action: t("emails.purchaseOrder.open"),
      note: t("emails.purchaseOrder.note"),
      reason: t("emails.purchaseOrder.reason", { buyer }),
      tagline: t("emails.tagline"),
      labels: {
        revision: t("emails.purchaseOrder.labels.revision"),
        requiredBy: t("emails.purchaseOrder.labels.requiredBy"),
        shipTo: t("emails.purchaseOrder.labels.shipTo"),
        paymentTerms: t("emails.purchaseOrder.labels.paymentTerms"),
        total: t("emails.purchaseOrder.labels.total")
      },
      ...(order.items.length > shownLines && {
        more: t("emails.purchaseOrder.more", { count: order.items.length - shownLines })
      })
    }
  })
  return { email, attachments: [{ filename: po.doc.name, content: Buffer.from(po.bytes).toString("base64") }] }
}

async function customerDataRequest(input: EmailInput<"data_request">, lang: Locale, t: Translator): Promise<Written> {
  const { shop } = input
  const subject = t("emails.customerDataRequest.subject", { shop })
  const lead = t("emails.customerDataRequest.lead")
  const email = await customerDataRequestEmail({
    appUrl: appUrl(),
    shop,
    requestId: input.requestId,
    orders: input.orders,
    lang,
    copy: {
      subject,
      eyebrow: t("emails.customerDataRequest.eyebrow"),
      heading: subject,
      lead,
      preview: lead,
      note: t("emails.customerDataRequest.noContactDetails"),
      reason: t("emails.customerDataRequest.reason", { shop }),
      tagline: t("emails.tagline"),
      labels: {
        store: t("emails.customerDataRequest.labels.store"),
        request: t("emails.customerDataRequest.labels.request"),
        ordersHeld: t("emails.customerDataRequest.labels.ordersHeld")
      },
      none: t("emails.customerDataRequest.none"),
      ordersIntro: t("emails.customerDataRequest.ordersIntro")
    }
  })
  return { email, attachments: [] }
}

async function labelsReady(input: EmailInput<"ready">, lang: Locale, t: Translator): Promise<Written> {
  // A purchase order's shipments are numbered oldest first, as the app numbers them.
  const [[released], numbered] = await Promise.all([
    db()
      .select({ shipment: shipments, order: orders.data, buyer: organizations.name })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .innerJoin(organizations, eq(organizations.id, orders.buyerOrgId))
      .where(and(eq(shipments.id, input.shipmentId), eq(shipments.orderId, input.orderId))),
    db()
      .select({ id: shipments.id })
      .from(shipments)
      .where(eq(shipments.orderId, input.orderId))
      .orderBy(shipments.createdAt)
  ])
  if (!released) {
    throw new Error("Shipment is missing")
  }
  const { shipment, buyer } = released
  const { reference } = released.order
  const number = numbered.findIndex((row) => row.id === shipment.id) + 1
  const lead = t("emails.labelsReady.lead", { buyer })
  const email = await labelsReadyEmail({
    appUrl: appUrl(),
    shipmentId: shipment.id,
    cartons: shipment.packing?.cartons.length,
    destination: await shipmentDestination(shipment),
    readyDate: shipment.packing?.readyDate,
    amazonShipments: shipment.amazonShipmentId?.split(", "),
    lang,
    copy: {
      // Only the purchase order when the shipment's number isn't known.
      subject: number
        ? t("emails.labelsReady.subjectShipment", { reference, shipment: number })
        : t("emails.labelsReady.subject", { reference }),
      eyebrow: t("emails.labelsReady.eyebrow"),
      heading: number
        ? t("emails.labelsReady.headingShipment", { reference, shipment: number })
        : t("emails.labelsReady.heading", { reference }),
      lead,
      preview: lead,
      action: t("emails.labelsReady.open"),
      reason: t("emails.labelsReady.reason", { buyer }),
      tagline: t("emails.tagline"),
      labels: {
        cartons: t("emails.labelsReady.labels.cartons"),
        destination: t("emails.labelsReady.labels.destination"),
        readyForPickup: t("emails.labelsReady.labels.readyForPickup"),
        amazonShipment: t("emails.labelsReady.labels.amazonShipment")
      },
      steps: [
        t("emails.labelsReady.steps.print"),
        t("emails.labelsReady.steps.attach"),
        t("emails.labelsReady.steps.handOver")
      ]
    }
  })
  return { email, attachments: [] }
}

// A date such as "Dec 1, 2026" in the reader's language. It has no time of day, so it's read in UTC to stay the same
// day everywhere.
function day(date: string, locale: Locale) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })
}
