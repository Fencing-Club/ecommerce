import { transportProfiles } from "@repo/aisle/transport"
import { Status, StatusBadge } from "@/components/common"
import { shipmentActionFeedback } from "@/lib/shipment-action-feedback"

type Arrangement = {
  id: string
  title: string
  destination: "awd" | "fba" | "warehouse"
  service: keyof typeof transportProfiles
  forwarder: boolean
  pickup: boolean
}
const arrangements: Arrangement[] = [
  {
    id: "awd-supplier",
    title: "AWD / Supplier ships",
    destination: "awd",
    service: "parcel",
    forwarder: false,
    pickup: false
  },
  { id: "awd-agl", title: "AWD / AGL", destination: "awd", service: "agl", forwarder: false, pickup: true },
  {
    id: "awd-forwarder",
    title: "AWD / Freight forwarder picks up",
    destination: "awd",
    service: "freight",
    forwarder: true,
    pickup: true
  },
  {
    id: "fba-supplier",
    title: "FBA / Supplier ships",
    destination: "fba",
    service: "parcel",
    forwarder: false,
    pickup: false
  },
  { id: "fba-agl", title: "FBA / AGL", destination: "fba", service: "agl", forwarder: false, pickup: true },
  {
    id: "fba-forwarder",
    title: "FBA / Freight forwarder picks up",
    destination: "fba",
    service: "freight",
    forwarder: true,
    pickup: true
  },
  {
    id: "warehouse-supplier",
    title: "Buyer warehouse / Supplier ships",
    destination: "warehouse",
    service: "parcel",
    forwarder: false,
    pickup: false
  },
  {
    id: "warehouse-forwarder",
    title: "Buyer warehouse / Freight forwarder picks up",
    destination: "warehouse",
    service: "freight",
    forwarder: true,
    pickup: true
  }
]
type Transition = { state: string; action: string; owner: string; gate: string; next: string }
function feedback(row: Transition) {
  return (
    Object.entries(shipmentActionFeedback).find(([action]) => action === row.action)?.[1] ?? { email: "", toast: null }
  )
}
function preparation(a: Arrangement, state: "packing" | "at_forwarder"): Transition[] {
  const onward = state === "at_forwarder"
  const row = (action: string, owner: string, gate: string): Transition => ({ state, action, owner, gate, next: state })
  if (a.forwarder && !onward) {
    return [
      row(
        "Confirm first-leg pickup",
        "Buyer / Forwarder",
        "Supplier → forwarder. Confirm pickup address, dates and service. Authorized payer approves any quote before booking."
      ),
      row(
        "Prepare first-leg documents",
        "System / responsible shipper",
        "Provide the packing list and documents required for pickup. Do not block this leg on onward Amazon booking or labels. Required packing validation must succeed."
      )
    ]
  }
  return [
    row(
      "Confirm the leg",
      "Buyer / Forwarder",
      onward
        ? "Forwarder → final destination. Reuse valid setup; revalidate changed cartons, origin, dates and quotes."
        : "Supplier → next stop. If that stop is a forwarder, book this leg separately; complete Amazon and onward setup before onward dispatch."
    ),
    ...(a.destination === "fba"
      ? [
          row(
            "Review FBA placement and transport",
            "Buyer",
            "For the Amazon leg: compare available splits, destinations, placement fees, modes, carriers and dated quotes. Use the actual ship-from address; include pallet details for freight."
          ),
          row(
            "Approve FBA placement and charges",
            "Buyer",
            "Explicitly approve selected placement and fees before confirmation. Review total estimated cost before committing placement. Transport requires approval below."
          )
        ]
      : []),
    ...(a.destination === "awd"
      ? [
          row(
            "Review and confirm AWD inbound",
            "Buyer",
            "Validate eligibility, cartons and assigned destination; confirm the inbound order or link an existing one. This does not book transport."
          )
        ]
      : []),
    ...(a.service === "agl"
      ? [
          row(
            "Approve and book AGL",
            "Buyer",
            "Review service, origin, pickup, dates and price. Approve charges and book separately in Seller Central, then link the booking. Reuse existing bookings."
          )
        ]
      : [
          row(
            "Approve transport for this leg",
            "Buyer / authorized payer",
            "Choose supplier-arranged transport, forwarder pickup or an eligible carrier service. Confirm service, dates and quote before booking. Onward AGL uses the separate AGL booking gate."
          )
        ]),
    ...(a.destination === "fba"
      ? [
          row(
            "Confirm FBA transport",
            "Buyer / System after approval",
            "Confirm the approved option for every split. Partnered confirmation accepts shipping charges. Non-partnered transport requires a delivery window and externally obtained carrier documents."
          )
        ]
      : []),
    ...(a.destination !== "warehouse"
      ? [
          row(
            "Retrieve Amazon carton labels",
            "System",
            a.destination === "fba"
              ? "After placement and transport confirmation, retrieve labels and match each to its carton. Carrier labels depend on the booked service."
              : "After AWD inbound confirmation, retrieve carton labels. They can precede AGL booking and are not proof of booked transport. AWD partnered booking uses Seller Central."
          )
        ]
      : []),
    row(
      "Prepare documents for this leg",
      "System / responsible shipper",
      "Provide packing list and applicable carton, carrier or pallet labels. External bookings supply external carrier documents. Allow downloads as documents become available; downloading never accepts charges."
    )
  ]
}
function transitions(a: Arrangement): Transition[] {
  const viaForwarder = a.forwarder || !a.pickup
  return [
    { state: "packing", action: "Save draft", owner: "Supplier", gate: "Partial packing is allowed.", next: "packing" },
    ...(a.destination === "fba"
      ? [
          {
            state: "packing",
            action: "Validate packing submission",
            owner: "Supplier / System",
            gate: "On Submit packing: create or reuse the plan using buyer authorization, obtain packing groups, confirm an authorized packing option, submit carton contents and await Amazon’s result. Paid choices require buyer approval. Errors preserve the draft and identify cartons and supplier SKUs.",
            next: "packing"
          }
        ]
      : []),
    {
      state: "packing",
      action: "Submit packing",
      owner: "Supplier",
      gate: "All units packed; measurements and required documents valid; required Amazon validation succeeded. If buyer review is required.",
      next: "approval"
    },
    {
      state: "packing",
      action: "Submit packing",
      owner: "Supplier",
      gate: "Same packing checks. Without buyer review, proceed to document preparation.",
      next: "packing"
    },
    {
      state: "approval",
      action: "Approve invoice",
      owner: "Buyer",
      gate: "Approve the submitted revision when invoice review is required. Approval alone does not release shipment documents.",
      next: "packing"
    },
    {
      state: "approval",
      action: "Request changes",
      owner: "Buyer",
      gate: "Include requested corrections. Show them while the supplier revises packing.",
      next: "packing"
    },
    {
      state: "packing",
      action: "Revise and resubmit",
      owner: "Supplier",
      gate: "Resolve corrections and revalidate before review. Reconcile any linked Amazon shipment before changing packing.",
      next: "approval"
    },
    ...preparation(a, "packing"),
    {
      state: "packing",
      action: "Release to supplier",
      owner: "Buyer",
      gate: "Packing and approvals complete. Confirm transport and required documents for this leg only. A missing reference must not block existing document downloads.",
      next: "ready"
    },
    {
      state: "ready",
      action: a.pickup ? "Confirm pickup" : "Confirm dispatch",
      owner: "Supplier / handoff party",
      gate: "Goods actually handed over. Follow the configured next stop: forwarder or final destination.",
      next: "shipped"
    },
    ...(viaForwarder
      ? [
          {
            state: "shipped",
            action: "Confirm receipt at forwarder",
            owner: "Forwarder",
            gate: "Only when a forwarder is the next stop, including supplier-arranged delivery. Record cartons received and discrepancies.",
            next: "at_forwarder"
          },
          ...preparation(a, "at_forwarder"),
          {
            state: "at_forwarder",
            action: "Release onward shipment",
            owner: "Buyer",
            gate: "When onward approval is required, approve the revision and resolve discrepancies. Otherwise skip this action.",
            next: "at_forwarder"
          },
          {
            state: "at_forwarder",
            action: "Confirm onward dispatch",
            owner: "Forwarder",
            gate: "Required approval granted; discrepancies resolved; destination, transport and documents confirmed. Goods actually dispatched.",
            next: "shipped"
          }
        ]
      : []),
    {
      state: "shipped",
      action: "Confirm receipt",
      owner: "Buyer / destination evidence",
      gate: "Receipt at final destination after direct transport or the onward leg.",
      next: "received"
    },
    {
      state: "received",
      action: "Download documents",
      owner: "Authorized parties",
      gate: "No state change. Available documents can also be downloaded in earlier states.",
      next: "received"
    }
  ]
}
function stateBadge(state: string, pickup: boolean) {
  if (state === "ready") {
    return <StatusBadge tone="success">{pickup ? "Ready for pickup" : "Ready to ship"}</StatusBadge>
  }
  if (state === "shipped") {
    return <StatusBadge tone="info">In transit</StatusBadge>
  }
  if (state === "at_forwarder") {
    return <StatusBadge tone="info">At forwarder</StatusBadge>
  }
  return <Status status={state} />
}
export function ShipmentStateMap() {
  return (
    <main className="mx-auto max-w-7xl space-y-8 p-6 text-sm">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Shipment states and actions</h1>
        <p className="text-muted-foreground">
          Required states, actions, responsibilities and approval gates for each shipping arrangement.
        </p>
      </header>
      <section className="rounded-lg border p-4 space-y-3" aria-label="PO acceptance and shipment packing">
        <h2 className="font-semibold">Accept PO → start shipment packing</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span>Purchase order</span>
          <StatusBadge tone="warning">Awaiting approval</StatusBadge>
          <span>→ Supplier accepts →</span>
          <Status status="accepted" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span>Each shipment starts immediately in</span>
          <Status status="packing" />
        </div>
        <p>
          Accepted belongs to the PO, not the shipment. Record acceptance in the timeline and email the buyer. The PO
          stays Accepted while its shipments progress independently. Approving proposed PO changes starts packing in the
          same way.
        </p>
      </section>
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Shipment states</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Status status="packing" />
          <span>→</span>
          <StatusBadge tone="success">Ready for pickup / Ready to ship</StatusBadge>
          <span>→</span>
          {stateBadge("shipped", false)}
          <span>→</span>
          <Status status="received" />
        </div>
        <p>
          Approval needed is conditional. Requested changes return to Packing. Document preparation, validation,
          shipping choices and cost approvals are actions or gates, not additional statuses.
        </p>
        <p>
          Release requires documents and confirmed transport for the current leg. Downloads remain available
          independently.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Forwarder handoff</h2>
        <p>
          Supplier delivery to a forwarder and forwarder pickup both follow: In transit → At forwarder → In transit →
          Received.
        </p>
        <p>
          Keep At forwarder during onward preparation and required buyer approval. Change to In transit only on actual
          onward dispatch.
        </p>
        <p>
          AWD, FBA and buyer warehouses share these states. Packing requirements depend on destination; carrier labels
          and pickup depend on each leg’s transport.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Shipping choices and cost approval</h2>
        <p>
          FBA: submit packing for Amazon validation → compare placement and transport → buyer approves fees → confirm
          each split → retrieve labels.
        </p>
        <p>
          AWD: review and confirm inbound → retrieve carton labels. AGL booking and price approval are separate; labels
          do not confirm pickup.
        </p>
        <p>
          For a forwarder route, apply Amazon setup to the onward leg. The supplier-to-forwarder leg can proceed with
          its own approved transport and documents.
        </p>
        <p>
          Reuse confirmed bookings. Changed packing or expired quotes require revalidation and renewed approval of
          affected charges. Declined approval returns to option selection. Never book or accept charges automatically.
        </p>
        <p className="text-muted-foreground">
          References:{" "}
          <a
            className="underline"
            href="https://developer-docs.amazon/sp-api/docs/create-amazon-partnered-carrier-shipment"
          >
            FBA workflow
          </a>{" "}
          and{" "}
          <a className="underline" href="https://developer-docs.amazon/sp-api/docs/create-an-inbound-order">
            AWD workflow
          </a>
          .
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Amazon validation on submission</h2>
        <p>
          Keep the shipment in Packing while validation runs. Await Amazon’s asynchronous result before accepting the
          submission. On failure, preserve entries and show actionable errors beside the relevant carton or product.
          Connection failures go to the buyer; they are not supplier packing errors.
        </p>
        <p>
          Packing groups can be fetched from the item plan before carton submission. If first checked on submission,
          incompatible carton contents require correction. Validation never authorizes new charges.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Booking in our app</h2>
        <p>
          Eligible FBA partnered carrier: show Amazon-returned placement options, services and quotes; obtain buyer
          approval; confirm placement and transport; retrieve applicable labels. Availability depends on origin,
          destination and account eligibility.
        </p>
        <p>
          AGL: complete the separate booking in Seller Central and link it here. Do not treat the inbound API as an AGL
          booking API. AWD partnered carrier bookings also use Seller Central. Other carriers require their own booking
          integration or uploaded documents.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Notifications</h2>
        <p>
          Email recipients exclude the actor and follow access and preferences. Send once after a committed action. Show
          a contextual success toast; on failure, preserve entries and offer a safe retry. Drafts and downloads send no
          email.
        </p>
      </section>
      {arrangements.map((a) => (
        <section key={a.id} className="space-y-3" aria-label={a.title}>
          <h2 className="text-lg font-semibold">{a.title}</h2>
          <p className="text-muted-foreground">
            Amazon carton labels: {a.destination !== "warehouse" ? "Required for the Amazon leg" : "Not required"}.
            Carrier labels:{" "}
            {transportProfiles[a.service].carrierLabels === "per_carton"
              ? "As required by the selected carrier service"
              : "Not required by default"}
            .
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1250px] text-left">
              <caption className="sr-only">{a.title} transitions</caption>
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {[
                    "Current state",
                    "Action",
                    "Who acts",
                    "Approval or prerequisite",
                    "Next state",
                    "Email notification",
                    "Toast"
                  ].map((label) => (
                    <th key={label} className="p-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transitions(a).map((row, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="p-3">{stateBadge(row.state, a.pickup)}</td>
                    <td className="p-3 font-medium">{row.action}</td>
                    <td className="p-3">{row.owner}</td>
                    <td className="max-w-lg p-3">{row.gate}</td>
                    <td className="p-3">{stateBadge(row.next, a.pickup)}</td>
                    <td className="min-w-64 max-w-sm p-3">{feedback(row).email}</td>
                    <td className="min-w-40 p-3">{feedback(row).toast}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Exceptions and approval rules</h2>
        <ul className="list-disc space-y-2 ps-5">
          <li>
            Processing errors are blockers. Retry only when safe. An uncertain Amazon create or booking must be
            reconciled first.
          </li>
          <li>
            <Status status="cancelled" /> Terminal only after required Amazon cancellation is confirmed. Invoice
            rejection requests correction, not automatic shipment cancellation.
          </li>
          <li>
            Commercial PO changes require the other party’s approval and must not silently update a released packing
            revision.
          </li>
          <li>
            Approval applies to the submitted revision. Changed prices, quantities or packing require review before
            release. Non-Amazon shipments must satisfy their transport and document requirements too.
          </li>
          <li>Record forwarder receipt separately from final destination receipt. Dispatch confirms neither.</li>
        </ul>
      </section>
    </main>
  )
}
