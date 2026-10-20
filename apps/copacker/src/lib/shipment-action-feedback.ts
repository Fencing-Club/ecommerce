// Workflow documentation and toast stories share this copy. Email names refer to the Novu event catalog.

export const shipmentActionFeedback = {
  "Save draft": { actor: "Supplier", toast: "Your draft for Shipment 1 was saved.", email: "" },

  "Submit packing": {
    actor: "Supplier",
    toast: "Packing details submitted for Shipment 1.",

    email:
      "shipment-packing-submitted → Buyer. Action required / packing review. Immediate when review is required; otherwise optional. One email per revision."
  },

  "Approve invoice": {
    actor: "Buyer",
    toast: "You approved the invoice for PO36.",

    email:
      "shipment-invoice-approved → Supplier. Order change decision / invoice approved. Immediate; combine with the revised-PO email when both describe the same decision."
  },

  "Request changes": {
    actor: "Buyer",
    toast: "You requested changes to PO36.",

    email:
      "shipment-correction-requested → Supplier. Action required / packing correction. Immediate; include reason and review link."
  },

  "Revise and resubmit": {
    actor: "Supplier",
    toast: "Packing details resubmitted for Shipment 1.",

    email:
      "shipment-packing-submitted → Buyer. Action required / packing review. Immediate when review is required; one email for the new revision."
  },

  "Create or validate Amazon shipment": {
    actor: "System",
    toast: null,

    email:
      "Shipment processing needs attention → Responsible buyer, using Action required, when intervention is needed."
  },

  "Match Amazon carton labels": {
    actor: "System",
    toast: null,

    email:
      "Action required → Buyer only for an outstanding requirement. Document availability alone does not send the supplier a release email."
  },

  "Release to supplier": {
    actor: "Buyer",
    toast: "Documents released to the supplier for Shipment 1.",

    email:
      "shipment-documents-released → Supplier. Labels ready. Immediate; authorized shipment link. Unjoined suppliers require manual sharing."
  },

  "Confirm pickup": {
    actor: "Supplier or Forwarder",
    toast: "You confirmed pickup of Shipment 1.",

    email:
      "shipment-pickup-confirmed → Buyer, assigned forwarder and other responsible supplier users. Pickup / pickup confirmed. Immediate; do not also email a duplicate dispatch event."
  },

  "Confirm dispatch": {
    actor: "Supplier",
    toast: "You marked Shipment 1 as dispatched.",

    email:
      "shipment-supplier-dispatched → Buyer and assigned receiving forwarder. Shipment update / supplier dispatched. Optional for buyer; immediate for forwarder."
  },

  "Confirm receipt at forwarder": {
    actor: "Forwarder",
    toast: "Shipment 1 received at the forwarder.",

    email:
      "shipment-forwarder-received → Buyer and supplier. Shipment update / forwarder received. Immediate; actual received quantities and discrepancies."
  },

  "Release onward shipment": {
    actor: "Buyer",
    toast: "You released Shipment 1 for onward shipping.",
    email: "shipment-onward-release-approved → Forwarder. Onward shipment approved."
  },
  "Confirm onward dispatch": {
    actor: "Forwarder",
    toast: "Shipment 1 dispatched by the forwarder.",

    email:
      "shipment-forwarder-dispatched → Buyer; supplier subscribers. Shipment update / forwarder dispatched. Immediate for buyer; optional for supplier."
  },

  "Confirm receipt": {
    actor: "Buyer",
    toast: "Shipment 1 received at its destination.",

    email:
      "shipment-destination-received → Supplier and assigned forwarder. Shipment update / destination received. Immediate."
  },

  "Download documents": { actor: "Buyer, Supplier or Forwarder", toast: null, email: "" }
} satisfies Record<string, { actor: string; toast: string | null; email: string }>

export const shipmentFailureFeedback = {
  actor: "Supplier",
  title: "We couldn’t save Shipment 1.",

  description: "Your entries are still here."
}

export const purchaseOrderFeedback = [
  { actor: "Buyer", title: "Your draft for PO36 was saved." },
  { actor: "Buyer", title: "You submitted PO36 for supplier approval." },
  { actor: "Supplier", title: "You accepted PO36." },
  { actor: "Supplier", title: "You rejected PO36." },
  { actor: "Supplier", title: "You proposed changes to PO36." },
  { actor: "Buyer", title: "You approved the changes to PO36." },
  { actor: "Buyer", title: "You requested changes to PO36." },
  { actor: "Buyer", title: "We couldn’t submit PO36.", error: true },
  { actor: "Buyer", title: "We couldn’t save PO36.", error: true, description: "Your entries are still here." },
  { actor: "Buyer or Supplier", title: "We couldn’t update PO36.", error: true }
]
