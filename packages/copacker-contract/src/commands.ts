export interface CommandDefinition {
  operation: string
  description: string
  positional?: "id" | "variantId" | "reference" | "query" | "provider" | "operation"
  upload?: boolean
  export?: boolean
  write?: boolean
  confirmation?: boolean
  preview?: boolean
  bulk?: boolean
  paged?: boolean
  flags: readonly string[]
}

const paging = ["limit", "cursor"]
const source = ["connection", "marketplace"]
const period = ["from", "to", "time-zone"]
const guarded = ["revision"]
const shipmentGuard = ["revision", "po-revision"]
const productFilters = ["kind", "connection", "supplier", "state", "sku", "query", "sort", "direction"]
const orderFilters = [
  "provider",
  ...source,
  ...period,
  "sku",
  "payment-status",
  "fulfillment-status",
  "query",
  "sort",
  "direction"
]
const poFilters = ["state", "supplier", "destination", "due-from", "due-to", "query", "sort", "direction"]
const stockFilters = ["connection", "location", "variant", "sku", "kind"]
const expenseFilters = ["type", "connection", "channel", "currency", "po", "shipment", "order", ...period, "date-basis"]

function command(
  operation: string,
  description: string,
  flags: readonly string[] = [],
  options: Omit<CommandDefinition, "operation" | "description" | "flags"> = {}
): CommandDefinition {
  return { operation, description, flags, ...options }
}
function read(
  operation: string,
  description: string,
  flags: readonly string[] = [],
  positional: CommandDefinition["positional"] = "id"
) {
  return command(operation, description, flags, { positional })
}
function list(
  operation: string,
  description: string,
  flags: readonly string[] = [],
  positional?: CommandDefinition["positional"]
) {
  return command(operation, description, [...paging, ...flags], { paged: true, positional })
}
function write(
  operation: string,
  description: string,
  flags: readonly string[] = [],
  positional: CommandDefinition["positional"] = "id",
  confirmation = false
) {
  return command(operation, description, flags, { write: true, positional, confirmation })
}
function exportCommand(
  operation: string,
  description: string,
  flags: readonly string[] = [],
  positional?: CommandDefinition["positional"]
) {
  return command(operation, description, flags, { export: true, positional })
}
function upload(
  operation: string,
  description: string,
  flags: readonly string[],
  positional?: CommandDefinition["positional"]
) {
  return command(operation, description, flags, { upload: true, write: true, positional })
}
function controlled(
  operation: string,
  description: string,
  flags: readonly string[],
  positional: CommandDefinition["positional"],
  bulk = true
) {
  return command(operation, description, flags, { write: true, preview: true, bulk, positional })
}

/** Local command vocabulary. Availability and all business validation come from the deployed registry. */
export const commands: readonly CommandDefinition[] = [
  command("account.show", "Show the signed-in account and authentication metadata."),
  list("account.credential.list", "List automation credentials without secrets.", ["state"]),
  read("account.credential.show", "Show a credential's scopes, expiry and use."),
  command(
    "account.credential.create",
    "Issue a scoped automation credential to a protected destination.",
    ["name", "scope", "expires-in"],
    { write: true }
  ),
  write("account.credential.rotate", "Rotate a credential with a bounded overlap.", [...guarded, "overlap-seconds"]),
  write("account.credential.revoke", "Revoke every generation of a credential.", [...guarded, "reason"], "id", true),
  list("workspace.list", "List accessible workspaces."),
  command("workspace.show", "Show the selected workspace and effective capabilities."),
  command("status", "Show connection health, data coverage and operations needing attention."),
  list("schema.list", "List deployed operations.", ["prefix"]),
  read("schema.show", "Show an operation's schemas, permissions and effects.", [], "operation"),
  list("order.list", "List ingested customer sales orders.", orderFilters),
  read("order.show", "Show a customer sales order by ID or source reference.", source, "reference"),
  exportCommand("order.export", "Export customer sales orders.", orderFilters),
  list("po.list", "List purchase orders.", poFilters),
  read("po.show", "Show a purchase order by ID or reference.", ["connection"], "reference"),
  list("po.coverage", "Show open PO quantities and allocations.", ["variant", "supplier", "destination"]),
  list("po.history", "Read PO revisions, events and comments.", [], "id"),
  command("po.check", "Validate a proposed or existing purchase order.", ["id"]),
  command("po.create", "Create a purchase order draft.", [], { write: true }),
  write("po.update", "Replace an existing purchase order draft.", guarded),
  write("po.submit", "Send a reviewed purchase order.", guarded, "id", true),
  write("po.close", "Close an eligible purchase order.", guarded, "id", true),
  write("po.delete", "Delete a purchase order draft.", guarded, "id", true),
  write("po.comment", "Append a comment to a purchase order.", ["message"]),
  exportCommand("po.export", "Export a PO PDF or purchase order collection.", ["id", ...poFilters]),
  read("po.label.list", "List available PO labels.", ["line"]),
  read("po.label.download", "Download product or warning labels.", ["line", "type"]),
  write("po.proposal.create", "Propose changes to a sent purchase order.", guarded),
  list("po.proposal.list", "List proposals for a purchase order.", [], "id"),
  read("po.proposal.show", "Show a purchase order proposal."),
  write("po.proposal.approve", "Approve proposed commercial changes.", shipmentGuard, "id", true),
  write("po.proposal.decline", "Decline a proposal.", [...shipmentGuard, "reason"], "id", true),
  write("po.proposal.withdraw", "Withdraw your pending proposal.", shipmentGuard, "id", true),
  upload("po.import", "Extract a purchase order PDF for review.", ["connection"]),
  list("po.import.list", "List purchase order imports.", ["state"]),
  read("po.import.show", "Inspect an import's extraction and unresolved rows.", ["operation-id"]),
  read("po.import.source", "Download the original imported PDF."),
  list("po.import.match", "Search candidates in the import's pinned store.", ["query"], "id"),
  write("po.import.update", "Save reviewed extraction corrections.", guarded),
  write("po.import.apply", "Create one draft from a reviewed import.", [...guarded, "reviewed"]),
  write("po.import.cancel", "Cancel an unsaved import.", guarded, "id", true),
  list("shipment.list", "List Copacker and external Amazon inbound shipments.", [
    "origin",
    "po",
    "supplier",
    "forwarder",
    "destination",
    "state",
    "network",
    "connection"
  ]),
  read("shipment.show", "Show shipment legs, packing, documents and next actions.", ["operation-id"]),
  command("shipment.lookup", "Find a shipment by its typed provider identity.", [
    "provider",
    "connection",
    "kind",
    "external-id"
  ]),
  command("shipment.create", "Create or resume packing for a purchase order.", ["po", "po-revision"], { write: true }),
  read("shipment.packing.show", "Read the current packing draft."),
  write("shipment.packing.save", "Save incomplete packing with PO and shipment guards.", shipmentGuard),
  read("shipment.check", "Check packing without reserving quantities."),
  write("shipment.submit", "Submit packing and return all network splits.", shipmentGuard, "id", true),
  write(
    "shipment.approve",
    "Approve invoice changes, with optional reviewed cost write-back.",
    [...shipmentGuard, "update-cost", "cost-preview"],
    "id",
    true
  ),
  write("shipment.correct", "Request a packing or invoice correction.", [...shipmentGuard, "reason"], "id", true),
  write(
    "shipment.release",
    "Release a complete shipment packet to the supplier.",
    [...shipmentGuard, "booking-reference"],
    "id",
    true
  ),
  write("shipment.ship", "Record supplier dispatch.", shipmentGuard, "id", true),
  write("shipment.forward", "Record the forwarder's carrier, reference and freight.", shipmentGuard, "id", true),
  write("shipment.receive", "Record whole-shipment receipt.", shipmentGuard, "id", true),
  write("shipment.reconcile", "Reconcile an uncertain provider creation.", shipmentGuard),
  write(
    "shipment.cancel",
    "Cancel an eligible shipment with provider reconciliation.",
    [...shipmentGuard, "reason"],
    "id",
    true
  ),
  upload("shipment.invoice.upload", "Attach a commercial invoice PDF.", shipmentGuard, "id"),
  read("shipment.invoice.download", "Download an authorized commercial invoice.", ["document"]),
  read("shipment.label.list", "List shipment labels and carton assignments."),
  upload(
    "shipment.label.upload",
    "Attach shipping labels with page-to-carton assignments.",
    [...shipmentGuard, "type"],
    "id"
  ),
  read("shipment.label.download", "Download current carton or shipping labels.", ["type", "document"]),
  read("shipment.packet.download", "Download the current supplier packet."),
  list("product.list", "List buyer or supplier products.", productFilters),
  read("product.show", "Show variants, listing links and field write destinations.", ["operation-id"]),
  list("product.search", "Search products and exact SKUs.", ["connection", "supplier"], "query"),
  command("product.create", "Create a supplier-owned product.", [], { write: true }),
  controlled("product.update", "Update permitted product fields or supplier product data.", guarded, "id"),
  controlled("product.variant.update", "Update metadata or a Shopify-owned SKU.", [...guarded, "sku"], "variantId"),
  controlled(
    "product.price.update",
    "Update the source and every linked selling-price target.",
    [...guarded, "amount", "currency"],
    "variantId"
  ),
  controlled(
    "product.cost.update",
    "Update the configured unit-cost source.",
    [...guarded, "amount", "currency"],
    "variantId"
  ),
  list("product.listing.list", "Discover linked and unmatched marketplace listings.", [
    ...source,
    "seller-sku",
    "unlinked",
    "variant"
  ]),
  read("product.listing.show", "Show a listing's identity, values and capabilities."),
  write("product.listing.link", "Link a listing to a durable variant identity.", [
    ...guarded,
    "variant",
    "pieces-per-listing"
  ]),
  write("product.listing.unlink", "Detach a listing without renaming its seller SKU.", guarded),
  controlled(
    "product.supplier.assign",
    "Assign a supplier to a product or reviewed rows.",
    [...guarded, "id", "supplier"],
    undefined
  ),
  upload("product.import", "Preview product data or seed Copacker metadata from Shopify.", [
    "kind",
    "location",
    "source",
    "connection"
  ]),
  read("product.import.show", "Inspect product import rows and issues.", ["operation-id"]),
  write("product.import.apply", "Apply a reviewed product import.", [...guarded, "reviewed"]),
  exportCommand("product.export", "Export products and permitted pricing.", productFilters),
  command("product.template", "Download a product import template.", ["kind", "file-format"]),
  read("product.label.show", "Show label settings and uploaded barcode metadata.", ["variant"]),
  write("product.label.update", "Change the local product label policy.", [...guarded, "setting"]),
  upload("product.label.upload", "Upload a one-page barcode PDF.", [...guarded, "variant"], "id"),
  read("product.label.download", "Download product barcode labels.", ["variant"]),
  write("product.label.remove", "Remove an uploaded product barcode.", [...guarded, "variant"], "id", true),
  upload("product.image.upload", "Upload a supplier catalog image.", guarded, "id"),
  write("product.image.remove", "Remove a supplier catalog image.", [...guarded, "image"], "id", true),
  list("inventory.list", "List native balances, units and snapshot provenance.", stockFilters),
  read("inventory.show", "Show a product's stock by location.", ["location", "operation-id"]),
  list("inventory.history", "Read available stock-day history.", ["location", ...period], "id"),
  exportCommand("inventory.export", "Export inventory balances.", stockFilters),
  controlled(
    "inventory.update",
    "Set a guarded count at one explicit location per row.",
    [...guarded, "location", "quantity", "state", "reason", "expected-quantity"],
    "variantId"
  ),
  controlled(
    "inventory.adjust",
    "Apply a guarded stock correction at a supported location.",
    [...guarded, "location", "delta", "state", "reason", "expected-quantity"],
    "variantId",
    false
  ),
  list("location.list", "List physical locations and channel-availability targets.", [
    "connection",
    "kind",
    "classification"
  ]),
  read("location.show", "Show quantity states and write capabilities."),
  write("location.update", "Classify an observed Shopify location.", [...guarded, "snapshot", "classification"]),
  list("catalog.list", "List supplier-owned catalogs.", ["state", "query"]),
  read("catalog.show", "Show catalog pricing, members and customer assignments."),
  command("catalog.create", "Create a supplier catalog.", [], { write: true }),
  write("catalog.update", "Replace a catalog using reviewed dependency revisions.", guarded),
  write("catalog.remove", "Remove a catalog and clear guarded assignments.", guarded, "id", true),
  exportCommand("catalog.export", "Export a supplier price list.", guarded, "id"),
  list("partners.list", "Look up supplier, forwarder or B2B customer relationships.", ["type", "query", "joined"]),
  read("partners.show", "Show an accessible partner relationship.", ["type"]),
  command(
    "partners.create",
    "Create a supplier or forwarder relationship without sending an invitation.",
    ["type", "name", "email"],
    { write: true }
  ),
  write("partners.update", "Update permitted partner fields.", guarded),
  write("partners.remove", "Remove a relationship while preserving historical references.", guarded, "id", true),
  write("partners.invite", "Send an explicit invitation to a partner.", [...guarded, "type", "email"], "id", true),
  write("partners.catalog.assign", "Assign a supplier catalog to a B2B customer.", [...guarded, "catalog"]),
  write("partners.catalog.remove", "Clear a guarded customer catalog assignment.", guarded),
  list("address.list", "List accessible workspace or partner addresses.", ["kind"]),
  read("address.show", "Show an address and its owner."),
  command("address.create", "Create a workspace or eligible partner address.", [], { write: true }),
  write("address.update", "Update an address without changing its owner.", guarded),
  write("address.remove", "Remove an unused address.", guarded, "id", true),
  list("connection.list", "List connections, granted scopes and dataset health.", ["provider"]),
  read("connection.show", "Show a connection or authorization status.", ["authorization-id"]),
  write(
    "connection.connect",
    "Start browser authorization for a provider.",
    ["expected-account", "shop-domain"],
    "provider"
  ),
  write("connection.reconnect", "Reauthorize the same provider account.", [...guarded, "expected-account"]),
  write("connection.disconnect", "Disconnect a provider and report revocation results.", guarded, "id", true),
  write("connection.sync", "Queue or resume a supported ingestion dataset.", ["dataset"]),
  read("connection.sync.show", "Show the latest or selected sync run.", ["run-id", "operation-id"]),
  read("connection.settings.show", "Show supported ingestion preferences."),
  write("connection.settings.update", "Update typed connection import preferences.", guarded),
  list("expense.list", "List imported charges, ad accruals, landed costs and recurring definitions.", expenseFilters),
  read("expense.show", "Show an expense with its source and inclusion basis."),
  exportCommand("expense.export", "Export expense data and provenance.", expenseFilters),
  command("expense.create", "Create a manual landed or recurring cost.", [], { write: true }),
  write("expense.update", "Replace a manual cost using its current revision.", guarded),
  write("expense.remove", "Remove a manual expense.", shipmentGuard, "id", true),
  command(
    "report.restock",
    "Calculate replenishment with source coverage and explanations.",
    ["channel", "supplier", "days", "lead-time-days", "state", "sku"],
    { export: true }
  ),
  command("restock.channel.list", "List eligible replenishment destinations."),
  command("restock.plan.create", "Review allocation of a reproducible restock report.", ["from-report"], {
    write: true
  }),
  read("restock.plan.show", "Show a restock plan and its dependency revisions."),
  write("restock.plan.create-pos", "Create all reviewed purchase order drafts atomically.", guarded),
  command(
    "report.demand",
    "Report fulfilled demand with attribution and coverage.",
    [...period, "connection", "channel", "product", "location", "sku"],
    { export: true }
  )
]
