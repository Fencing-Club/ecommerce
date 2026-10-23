import { randomUUID } from "node:crypto"
import {
  canonicalJson,
  connectionOperations,
  createRegistry,
  isQuery,
  jsonObject,
  operationSummarySchema,
  metaSchema,
  parseInput,
  partnerReadOperations,
  productReadOperations,
  inventoryReadOperations,
  orderReadOperations,
  shipmentReadOperations,
  requestSchema,
  setupOperations,
  stockTargetOperations,
  usesAccountContext,
  type OperationDefinition
} from "@repo/copacker-contract"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, withTransaction, type Executor } from "@/db"
import { cliGrants, memberships, operationReceipts, restockReports } from "@/db/schema"
import { LocalizedError, AccessError } from "@/i18n/errors"
import { accessSchema, can, effectiveAccess, isAdmin } from "@/lib/access"
import { CliError, cliPrincipal } from "./cli-auth"
import { boundedBody } from "./cli-http"
import { failureMessage, StatusError } from "./errors"
import { catalogWriteDefinitions, writeCatalog, writeCatalogAssignment } from "./operation-catalog-writes"
import {
  connectionSettings,
  operationConnections,
  updateConnectionSettings,
  connectionInventory,
  updateConnectionInventory
} from "./operation-connections"
import { importDefinitions, importFile, readImport, applyImport, exportFile, entityExport } from "./operation-imports"
import { inventoryUpdateDefinition, updateSupplierInventory } from "./operation-inventory-writes"
import { readCustomerOrders } from "./operation-order-reads"
import { partnerWriteDefinitions, createPartner, updatePartner } from "./operation-partner-writes"
import { readInventory, readProducts } from "./operation-product-reads"
import {
  productWriteDefinitions,
  createCliProduct,
  updateCliProduct,
  productSettings,
  updateCliVariant
} from "./operation-product-writes"
import {
  catalogDefinitions,
  poDefinitions,
  readCatalog,
  readCatalogs,
  readPartners,
  readPurchaseOrders
} from "./operation-purchasing-reads"
import { operationRestockChannels, operationRestockReport, restockDefinitions } from "./operation-restock"
import { readShipments } from "./operation-shipment-reads"
import { restockTargetReport } from "./restock-page"
import { restockPriceFields } from "./restock-plan"
import { hash, sign, verifySignature } from "./security"
import {
  listLocationGroups,
  readStockTargets,
  removeLocationGroup,
  saveLocationGroup,
  saveStockTargets
} from "./stock-targets"
import { workspaceMemberships, workspaceSession, type Session } from "./workspace-session"

type Context = {
  principal: Awaited<ReturnType<typeof cliPrincipal>>
  session: Session | null
  operation: string
  input: unknown
  executor: Executor
  responseMeta: Partial<z.infer<typeof metaSchema>>
}
const setup = setupOperations(accessSchema)
const member = (context: Context) => Boolean(context.session)
const buyer = (context: Context) => context.session?.org.kind === "buyer"
const admin = (context: Context) => buyer(context) && context.session !== null && isAdmin(context.session)
const restock = (context: Context) => buyer(context) && context.session !== null && can(context.session, "restock")
const productRead = (context: Context) => buyer(context) && context.session !== null && can(context.session, "products")
const productEdit = (context: Context) =>
  buyer(context) && context.session !== null && can(context.session, "products", "edit")
const account = () => true
const poRead = (context: Context) => context.session !== null && can(context.session, "orders")
const partnersRead = (context: Context) =>
  context.session !== null &&
  (context.session.org.kind === "buyer"
    ? can(context.session, "partners")
    : context.session.org.kind === "supplier" && can(context.session, "customers"))
const catalogsRead = (context: Context) =>
  context.session?.org.kind === "supplier" && can(context.session, "catalogs") && can(context.session, "prices")
const productsRead = (context: Context) =>
  context.session !== null && context.session.org.kind !== "forwarder" && can(context.session, "products")
const inventoryRead = (context: Context) =>
  context.session !== null &&
  context.session.org.kind !== "forwarder" &&
  can(context.session, context.session.org.kind === "supplier" ? "inventory" : "products")
const ordersRead = (context: Context) => context.session?.org.kind === "buyer" && can(context.session, "sales")
const shipmentsRead = (context: Context) => context.session !== null && can(context.session, "shipments")
function found<T>(row: T | undefined) {
  if (row === undefined) {
    throw new CliError("not_found", "Record not found.", 404)
  }
  return row
}
function session(context: Context) {
  if (!context.session) {
    throw new CliError("forbidden", "Select an accessible workspace.", 403)
  }
  return context.session
}
function entry<I extends z.ZodType, O extends z.ZodType>(
  definition: OperationDefinition<I, O>,
  allowed: (context: Context) => boolean,
  handle: (input: z.output<I>, context: Context) => Promise<unknown> | unknown
) {
  return {
    definition,
    allowed,
    execute: async (input: unknown, context: Context) =>
      definition.output.parse(await handle(definition.input.parse(input), context))
  }
}
type Entry = {
  definition: OperationDefinition
  allowed: (context: Context) => boolean
  execute: (input: unknown, context: Context) => Promise<unknown>
}
const catalogEdit = (context: Context) =>
  catalogsRead(context) &&
  context.session !== null &&
  can(context.session, "catalogs", "edit") &&
  can(context.session, "customers", "edit")
const partnerEdit = (context: Context) =>
  context.session?.org.kind === "buyer" && can(context.session, "partners", "edit")
const productsEdit = (context: Context) =>
  productsRead(context) &&
  context.session !== null &&
  can(context.session, "products", "edit") &&
  can(context.session, "prices")
const supplierProductsEdit = (context: Context) => productsEdit(context) && context.session?.org.kind === "supplier"
const supplierInventoryEdit = (context: Context) =>
  context.session?.org.kind === "supplier" && can(context.session, "inventory", "edit")
const supplierProductsRead = (context: Context) =>
  context.session?.org.kind === "supplier" && can(context.session, "products") && can(context.session, "prices")
const supplierInventoryRead = (context: Context) =>
  context.session?.org.kind === "supplier" && can(context.session, "inventory")
const entries: Entry[] = [
  entry(
    productWriteDefinitions["product.settings.show"],
    (context) => productRead(context) || supplierProductsRead(context),
    (input, context) => productSettings(session(context), input.id)
  ),
  entry(productWriteDefinitions["product.variant.update"], productEdit, (input, context) =>
    updateCliVariant(session(context), input)
  ),
  entry(importDefinitions["product.import"], supplierProductsEdit, (input, context) =>
    importFile(session(context), input, false)
  ),
  entry(importDefinitions["inventory.import"], supplierInventoryEdit, (input, context) =>
    importFile(session(context), input, true)
  ),
  entry(importDefinitions["product.import.apply"], supplierProductsEdit, (input, context) =>
    applyImport(session(context), input.previewId, false)
  ),
  entry(importDefinitions["inventory.import.apply"], supplierInventoryEdit, (input, context) =>
    applyImport(session(context), input.previewId, true)
  ),
  entry(importDefinitions["product.import.show"], supplierProductsRead, (input, context) =>
    readImport(session(context), input.id, false)
  ),
  entry(importDefinitions["inventory.import.show"], supplierInventoryRead, (input, context) =>
    readImport(session(context), input.id, true)
  ),
  entry(
    importDefinitions["product.export"],
    (context) => supplierProductsRead(context) && supplierInventoryRead(context),
    (input, context) => entityExport(session(context), input, false)
  ),
  entry(importDefinitions["inventory.export"], supplierInventoryRead, (input, context) =>
    entityExport(session(context), input, true)
  ),
  entry(importDefinitions["product.template"], supplierProductsRead, (input, context) =>
    exportFile(session(context), input.fileFormat, "template")
  ),
  entry(
    productWriteDefinitions["product.create"],
    (context) => productsEdit(context) && context.session?.org.kind === "supplier",
    (input, context) => createCliProduct(session(context), input)
  ),
  entry(productWriteDefinitions["product.update"], productsEdit, (input, context) =>
    updateCliProduct(session(context), input)
  ),
  entry(partnerWriteDefinitions["partners.create"], partnerEdit, (input, context) =>
    createPartner(session(context), input)
  ),
  entry(partnerWriteDefinitions["partners.update"], partnerEdit, (input, context) =>
    updatePartner(session(context), input)
  ),
  entry(
    inventoryUpdateDefinition,
    (context) => context.session?.org.kind === "supplier" && can(context.session, "inventory", "edit"),
    (input, context) => updateSupplierInventory(session(context), input)
  ),
  entry(catalogWriteDefinitions["catalog.create"], catalogEdit, (input, context) =>
    writeCatalog(session(context), input)
  ),
  entry(catalogWriteDefinitions["catalog.update"], catalogEdit, (input, context) =>
    writeCatalog(session(context), input)
  ),
  entry(catalogWriteDefinitions["partners.catalog.assign"], catalogEdit, (input, context) =>
    writeCatalogAssignment(session(context), input)
  ),
  entry(catalogWriteDefinitions["partners.catalog.remove"], catalogEdit, (input, context) =>
    writeCatalogAssignment(session(context), { ...input, catalogId: null })
  ),
  entry(restockDefinitions["report.restock.targets"], restock, async (input, context) => {
    const s = session(context)
    const result = await restockTargetReport(s, input)
    context.responseMeta = {
      completeness:
        result.unassigned.length ||
        result.rows.some((row) => row.issues.length || !row.line || row.line.status === "blocked")
          ? "partial"
          : "complete",
      redactedFields: can(s, "prices") ? [] : restockPriceFields.map((field) => `rows.*.line.${field}`)
    }
    return result
  }),
  entry(connectionOperations["connection.inventory.show"], admin, (input, context) =>
    connectionInventory(session(context), input.id, context.executor)
  ),
  entry(connectionOperations["connection.inventory.update"], admin, (input, context) =>
    updateConnectionInventory(session(context), input, context.executor)
  ),
  entry(stockTargetOperations["variant.stock-targets.show"], productRead, (input, context) =>
    readStockTargets(session(context), input, context.executor)
  ),
  entry(stockTargetOperations["variant.stock-targets.update"], productEdit, (input, context) =>
    saveStockTargets(session(context), input, context.executor)
  ),
  entry(stockTargetOperations["location.group.list"], productRead, (_, context) =>
    listLocationGroups(session(context), context.executor)
  ),
  entry(stockTargetOperations["location.group.save"], productEdit, (input, context) =>
    saveLocationGroup(session(context), input, context.executor)
  ),
  entry(stockTargetOperations["location.group.remove"], productEdit, (input, context) =>
    removeLocationGroup(session(context), input, context.executor)
  ),
  entry(shipmentReadOperations["shipment.list"], shipmentsRead, async (input, context) => {
    const result = await readShipments(session(context), input.origin !== "copacker" && !input.poId)
    context.responseMeta = result.metadata
    const rows = result.items.filter(
      (row) =>
        (!input.origin || row.origin === input.origin) &&
        (!input.poId || row.poId === input.poId) &&
        (!input.state || row.state === input.state) &&
        (!input.query ||
          row.reference?.toLowerCase().includes(input.query.toLowerCase()) ||
          row.providerReferences.some((ref) => ref.externalId.includes(input.query!)))
    )
    rows.sort(
      (a, b) =>
        (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
        (a.id ?? JSON.stringify(a.providerReferences)).localeCompare(b.id ?? JSON.stringify(b.providerReferences))
    )
    return page(rows, input, context)
  }),
  entry(shipmentReadOperations["shipment.show"], shipmentsRead, async (input, context) => {
    const result = await readShipments(session(context), false)
    context.responseMeta = result.metadata
    return found(result.items.find((row) => row.id === input.id))
  }),
  entry(orderReadOperations["order.list"], ordersRead, async (input, context) => {
    const result = await readCustomerOrders(session(context), input)
    context.responseMeta = result.metadata
    const rows = result.items.filter(
      (row) =>
        (!input.sku || row.items.some((item) => item.sku === input.sku)) &&
        (!input.query ||
          row.reference.toLowerCase().includes(input.query.toLowerCase()) ||
          row.items.some(
            (item) =>
              item.sku?.toLowerCase().includes(input.query!.toLowerCase()) ||
              item.title?.toLowerCase().includes(input.query!.toLowerCase())
          ))
    )
    rows.sort(
      (a, b) =>
        (a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) * (input.direction === "asc" ? 1 : -1)
    )
    return page(rows, input, context)
  }),
  entry(orderReadOperations["order.show"], ordersRead, async (input, context) => {
    const result = await readCustomerOrders(session(context), input)
    context.responseMeta = result.metadata
    const rows =
      "id" in input
        ? result.items
        : result.items.filter((row) => row.reference === input.reference || row.source.externalId === input.reference)
    if (rows.length > 1) {
      throw new CliError("ambiguous_reference", "Specify the order's connection or Copacker ID.", 409)
    }
    return found(rows[0])
  }),
  entry(productReadOperations["product.list"], productsRead, async (input, context) => {
    const result = await readProducts(session(context))
    context.responseMeta = result.metadata
    const rows = result.items.filter(
      (row) =>
        (!input.kind || row.kind === input.kind) &&
        (!input.status || row.status === input.status) &&
        (!input.supplierId || row.supplierId === input.supplierId) &&
        (!input.connectionId || row.source?.connectionId === input.connectionId) &&
        (!input.sku || row.variants.some((variant) => variant.sku === input.sku)) &&
        (!input.query ||
          row.title.toLowerCase().includes(input.query.toLowerCase()) ||
          row.variants.some((variant) => variant.sku?.toLowerCase().includes(input.query!.toLowerCase())))
    )
    rows.sort(
      (a, b) => (a.title.localeCompare(b.title) || a.id.localeCompare(b.id)) * (input.direction === "asc" ? 1 : -1)
    )
    return page(rows, input, context)
  }),
  entry(productReadOperations["product.search"], productsRead, async (input, context) => {
    const result = await readProducts(session(context))
    context.responseMeta = result.metadata
    const q = input.query.toLowerCase()
    const rows = result.items.filter(
      (row) =>
        (!input.supplierId || row.supplierId === input.supplierId) &&
        (!input.connectionId || row.source?.connectionId === input.connectionId) &&
        (row.title.toLowerCase().includes(q) || row.variants.some((variant) => variant.sku?.toLowerCase().includes(q)))
    )
    const exact = (row: (typeof rows)[number]) => Number(row.variants.some((variant) => variant.sku === input.query))
    rows.sort((a, b) => exact(b) - exact(a) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    return page(rows, input, context)
  }),
  entry(productReadOperations["product.show"], productsRead, async (input, context) => {
    const result = await readProducts(session(context))
    context.responseMeta = result.metadata
    return found(result.items.find((row) => row.id === input.id))
  }),
  entry(inventoryReadOperations["inventory.list"], inventoryRead, async (input, context) => {
    const result = await readInventory(session(context))
    context.responseMeta = result.metadata
    const rows = result.items.filter(
      (row) =>
        (!input.connectionId || row.source?.connectionId === input.connectionId) &&
        (!input.locationId || row.locationId === input.locationId) &&
        (!input.variantId || row.variantId === input.variantId) &&
        (!input.sku || row.sku === input.sku) &&
        (!input.kind || row.kind === input.kind)
    )
    rows.sort(
      (a, b) =>
        a.variantId.localeCompare(b.variantId) ||
        a.locationId.localeCompare(b.locationId) ||
        a.quantityState.localeCompare(b.quantityState)
    )
    return page(rows, input, context)
  }),
  entry(inventoryReadOperations["inventory.show"], inventoryRead, async (input, context) => {
    const result = await readInventory(session(context))
    context.responseMeta = result.metadata
    const rows = result.items.filter(
      (row) => row.variantId === input.id && (!input.locationId || row.locationId === input.locationId)
    )
    if (!rows.length) {
      throw new CliError("not_found", "Inventory not found.", 404)
    }
    return { items: rows }
  }),
  entry(inventoryReadOperations["location.list"], inventoryRead, async (input, context) => {
    const result = await readInventory(session(context))
    context.responseMeta = result.metadata
    return page(
      result.locations
        .filter(
          (row) =>
            (!input.connectionId || row.source?.connectionId === input.connectionId) &&
            (!input.kind || row.kind === input.kind)
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
      input,
      context
    )
  }),
  entry(partnerReadOperations["partners.list"], partnersRead, async (input, context) =>
    page(
      (await readPartners(session(context)))
        .filter(
          (row) =>
            (!input.type || row.type === input.type) &&
            (input.joined === undefined || (row.relationshipStatus === "joined") === input.joined) &&
            (!input.query || row.name.toLowerCase().includes(input.query.toLowerCase()))
        )
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
      input,
      context
    )
  ),
  entry(partnerReadOperations["partners.show"], partnersRead, async (input, context) =>
    found(
      (await readPartners(session(context))).find(
        (row) => row.id === input.id && (!input.type || row.type === input.type)
      )
    )
  ),
  entry(catalogDefinitions["catalog.list"], catalogsRead, async (input, context) =>
    page(
      (await readCatalogs(session(context)))
        .filter(
          (row) =>
            (!input.status || row.status === input.status) &&
            (!input.query || row.title.toLowerCase().includes(input.query.toLowerCase()))
        )
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
      input,
      context
    )
  ),
  entry(catalogDefinitions["catalog.show"], catalogsRead, (input, context) => readCatalog(session(context), input.id)),
  entry(poDefinitions["po.list"], poRead, async (input, context) => {
    const s = session(context)
    if (s.org.kind === "forwarder" || !can(s, "prices")) {
      context.responseMeta.redactedFields = ["lines.unitPriceMinor", "adjustments", "paymentTerms"]
    }
    const rows = (await readPurchaseOrders(s)).filter(
      (row) =>
        (!input.state || row.state === input.state) &&
        (!input.supplierId || row.supplierId === input.supplierId) &&
        (!input.destination || row.destination === input.destination) &&
        (!input.dueFrom || (row.dueDate !== null && row.dueDate >= input.dueFrom)) &&
        (!input.dueTo || (row.dueDate !== null && row.dueDate <= input.dueTo)) &&
        (!input.query || row.reference.toLowerCase().includes(input.query.toLowerCase()))
    )
    rows.sort(
      (a, b) =>
        ((a[input.sort] ?? "").localeCompare(b[input.sort] ?? "") || a.id.localeCompare(b.id)) *
        (input.direction === "asc" ? 1 : -1)
    )
    return page(rows, input, context)
  }),
  entry(poDefinitions["po.show"], poRead, async (input, context) => {
    const s = session(context)
    if (s.org.kind === "forwarder" || !can(s, "prices")) {
      context.responseMeta.redactedFields = ["lines.unitPriceMinor", "adjustments", "paymentTerms"]
    }
    return found((await readPurchaseOrders(s)).find((row) => row.id === input.id))
  }),
  entry(restockDefinitions["restock.channel.list"], restock, (_, context) =>
    operationRestockChannels(session(context))
  ),
  entry(restockDefinitions["report.restock"], restock, async (input, context) => {
    const result = await operationRestockReport(session(context), input, context.executor)
    context.responseMeta = result.metadata
    return result.data
  }),
  entry(setup["account.show"], account, (_, { principal }) => ({
    id: principal.user.id,
    email: principal.user.email,
    name: principal.user.name,
    workspaceId: null,
    authentication: { kind: "interactive", credentialId: null, expiresAt: principal.expiresAt, scopes: [] }
  })),
  entry(setup["workspace.list"], account, async (input, context) => {
    const rows = await workspaceMemberships(context.principal.user.id)
    const items = await Promise.all(
      rows.map(async ({ org }) => {
        const current = await workspaceSession(context.principal.user, org.id)
        return current ? workspace({ ...context, session: current }) : null
      })
    )
    return page(
      items.filter((item) => item !== null).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
      input,
      context
    )
  }),
  entry(setup["workspace.show"], member, (_, context) => workspace(context)),
  entry(setup["schema.show"], account, ({ operation }, context) => {
    const found = entries.find((item) => item.definition.descriptor.operation === operation)
    if (
      !found ||
      !found.allowed(context) ||
      (!context.session && !["account.show", "workspace.list"].includes(operation))
    ) {
      throw new CliError("not_found", "Operation is unavailable to this caller.", 404)
    }
    return found.definition.descriptor
  }),
  entry(setup["schema.list"], member, (input, context) =>
    page(
      available(context)
        .filter((item) => !input.prefix || item.operation.startsWith(input.prefix))
        .sort((a, b) => a.operation.localeCompare(b.operation))
        .map((item) => operationSummarySchema.parse(item)),
      input,
      context
    )
  ),
  entry(connectionOperations["connection.list"], buyer, async (input, context) =>
    page(
      (await operationConnections(session(context))).filter(
        (row) => !input.provider || row.provider === input.provider
      ),
      input,
      context
    )
  ),
  entry(connectionOperations["connection.show"], buyer, async ({ id }, context) => {
    const row = (await operationConnections(session(context))).find((item) => item.id === id)
    if (!row) {
      throw new CliError("not_found", "Connection not found.", 404)
    }
    return row
  }),
  entry(connectionOperations["connection.settings.show"], admin, ({ id }, context) =>
    connectionSettings(session(context), id, context.executor)
  ),
  entry(connectionOperations["connection.settings.update"], admin, (input, context) =>
    updateConnectionSettings(session(context), input, context.executor)
  )
]
const registry = createRegistry(entries.map((item) => item.definition))
function available(context: Context) {
  return entries.filter((item) => item.allowed(context)).map((item) => item.definition.descriptor)
}
function workspace(context: Context) {
  const s = session(context)
  const deployed = available(context)
  return {
    id: s.org.id,
    name: s.org.name,
    kind: s.org.kind,
    role: s.role,
    access: s.access,
    effectiveScopes: [...new Set(deployed.flatMap((item) => item.accessPolicy.scopes))],
    capabilities: deployed.map((item) => ({ operation: item.operation, available: true, reason: null }))
  }
}
const cursorSchema = z.strictObject({ binding: z.string(), after: z.string(), expires: z.number() })
function page<T>(items: T[], input: { limit?: number; cursor?: string }, context: Context) {
  if (items.length > 200000) {
    throw new CliError("result_too_large", "Narrow the selection before paging this collection.", 413)
  }
  const { cursor: _cursor, limit: _limit, ...filters } = z.record(z.string(), z.unknown()).parse(context.input)
  const binding = hash(
    canonicalJson({
      principal: context.principal.user.id,
      workspace: context.session?.org.id ?? null,
      operation: context.operation,
      filters,
      // Bind the complete selected inventory, so insertion/removal/reordering cannot silently skip a page.
      inventory: hash(canonicalJson(items))
    })
  )
  let start = 0
  if (input.cursor) {
    try {
      const [value, signature, extra] = input.cursor.split(".")
      if (!value || !signature || extra || !verifySignature(value, "operation-cursor", signature)) {
        throw new Error()
      }
      const parsed = cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")))
      if (parsed.binding !== binding || parsed.expires <= Date.now()) {
        throw new Error()
      }
      // The lists here are small control-plane inventories. Refuse changed pages rather than silently skipping data.
      const previous = items.findIndex((item) => hash(canonicalJson(item)) === parsed.after)
      if (previous < 0) {
        throw new Error()
      }
      start = previous + 1
    } catch {
      throw new CliError("invalid_cursor", "The list changed or the cursor expired. Start the list again.", 409)
    }
  }
  const selected = items.slice(start, start + (input.limit ?? 50))
  const last = selected.at(-1)
  const more = start + selected.length < items.length && last !== undefined
  const value = more
    ? Buffer.from(
        JSON.stringify({ binding, after: hash(canonicalJson(last)), expires: Date.now() + 30 * 60_000 })
      ).toString("base64url")
    : null
  return {
    items: selected,
    page: {
      nextCursor: value ? `${value}.${sign(value, "operation-cursor")}` : null,
      hasMore: more,
      consistency: "live"
    }
  }
}
async function mutation(
  context: Context,
  key: string | null,
  input: unknown,
  run: (context: Context) => Promise<unknown>
) {
  if (!key || !/^[\x21-\x7e]{1,200}$/.test(key)) {
    throw new CliError("idempotency_key_required", "Supply an Idempotency-Key for this change.")
  }
  const s = session(context)
  return db().transaction(async (tx) => {
    const [grant] = await tx.select().from(cliGrants).where(eq(cliGrants.id, context.principal.grantId)).for("share")
    if (!grant || grant.revokedAt || grant.expiresAt.getTime() <= Date.now()) {
      throw new CliError("unauthenticated", "Sign in again.", 401)
    }
    // Lock and recheck membership before writing, so a permission change cannot race a business mutation.
    const [current] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, s.org.id), eq(memberships.userId, s.user.id)))
      .for("share")
    const found = entries.find((item) => item.definition.descriptor.operation === context.operation)
    const fresh = current
      ? {
          ...context,
          executor: tx,
          session: { ...s, role: current.role, access: effectiveAccess(s.org.kind, current.access) }
        }
      : null
    if (!fresh || !found?.allowed(fresh)) {
      throw new CliError("forbidden", "Workspace access changed.", 403)
    }
    const retainedReport = context.operation === "report.restock"
    const fingerprint = hash(
      canonicalJson(retainedReport ? { input, role: fresh.session.role, access: fresh.session.access } : input)
    )
    const where = and(
      eq(operationReceipts.userId, s.user.id),
      eq(operationReceipts.orgId, s.org.id),
      eq(operationReceipts.operation, context.operation),
      eq(operationReceipts.key, key)
    )
    const created = await tx
      .insert(operationReceipts)
      .values({ userId: s.user.id, orgId: s.org.id, operation: context.operation, key, fingerprint })
      .onConflictDoNothing()
      .returning()
    if (!created.length) {
      const [saved] = await tx.select().from(operationReceipts).where(where).for("update")
      if (!saved || saved.fingerprint !== fingerprint) {
        throw new CliError("idempotency_conflict", "This key was used for another request.", 409)
      }
      if (saved.createdAt.getTime() + 7 * 86400_000 <= Date.now()) {
        throw new CliError("idempotency_expired", "This execution expired. Review before starting a new one.", 409)
      }
      if (!retainedReport) {
        return saved.result
      }
      const reference = z.object({ reportId: z.uuid() }).parse(saved.result)
      const [report] = await tx
        .select()
        .from(restockReports)
        .where(
          and(
            eq(restockReports.id, reference.reportId),
            eq(restockReports.orgId, s.org.id),
            eq(restockReports.userId, s.user.id)
          )
        )
      if (!report || report.expiresAt.getTime() <= Date.now()) {
        throw new CliError(
          "idempotency_expired",
          "This report expired. Request a new report with a new execution key.",
          409
        )
      }
      context.responseMeta = metaSchema.partial().parse(report.metadata)
      return report.data
    }
    const result = await withTransaction(tx, () => run(fresh))
    context.responseMeta = fresh.responseMeta
    await tx
      .update(operationReceipts)
      .set({ result: retainedReport ? z.object({ reportId: z.uuid() }).parse(result) : result })
      .where(where)
    return result
  })
}
export async function operationResponse(request: Request, operation: string) {
  const requestId = randomUUID()
  let workspaceId: string | null = null
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
  try {
    const principal = await cliPrincipal(request)
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
      throw new CliError("invalid_input", "Expected application/json.", 415)
    }
    let body: z.infer<typeof requestSchema>
    try {
      body = requestSchema.parse(parseInput(await boundedBody(request, 1048576)))
    } catch (error) {
      if (error instanceof CliError) {
        throw error
      }
      throw new CliError("invalid_input", "Invalid operation request.")
    }
    workspaceId = body.workspaceId ?? null
    const accountContext = usesAccountContext(operation, body.input)
    if (accountContext && body.workspaceId) {
      throw new CliError("invalid_input", "This operation uses account context; omit workspaceId.")
    }
    const current =
      !accountContext && body.workspaceId ? await workspaceSession(principal.user, body.workspaceId) : null
    if (!accountContext && !current) {
      throw new CliError("forbidden", "Select an accessible workspace.", 403)
    }
    const context: Context = {
      principal,
      session: current,
      operation,
      input: body.input,
      executor: db(),
      responseMeta: {}
    }
    const found = entries.find((item) => item.definition.descriptor.operation === operation)
    const definition = registry.get(operation)
    if (!found || !definition || !found.allowed(context)) {
      throw new CliError("not_found", "Operation is unavailable to this caller.", 404)
    }
    const parsed = definition.input.safeParse(body.input)
    if (!parsed.success) {
      throw new CliError("invalid_input", "The input does not match this operation's schema.")
    }
    const isRead = isQuery(definition.descriptor, jsonObject.parse(parsed.data))
    const result = isRead
      ? await found.execute(parsed.data, context)
      : await mutation(context, request.headers.get("idempotency-key"), parsed.data, (fresh) =>
          found.execute(parsed.data, fresh)
        )
    const data = definition.output.parse(result)
    return Response.json(
      {
        data,
        meta: {
          requestId,
          workspaceId,
          generatedAt: new Date().toISOString(),
          completeness: "complete",
          sources: [
            {
              provider: "copacker",
              accountId: null,
              dataset: operation,
              observedAt: new Date().toISOString(),
              freshness: "current",
              availability: "available",
              staleAfter: null
            }
          ],
          warnings: [],
          redactedFields: [],
          ...context.responseMeta
        }
      },
      { headers }
    )
  } catch (caught) {
    let status = 400
    if (caught instanceof StatusError) {
      status = caught.status
    } else if (caught instanceof AccessError) {
      status = 403
    }
    const error =
      caught instanceof LocalizedError
        ? new CliError(
            caught instanceof AccessError ? "forbidden" : "invalid_state",
            await failureMessage(caught),
            status
          )
        : caught
    const known = error instanceof CliError
    let code = known ? error.code : "internal_error"
    if (known && error.status === 401) {
      code = "unauthenticated"
    }
    if (known && error.status === 403) {
      code = "permission_denied"
    }
    return Response.json(
      {
        error: {
          code,
          message: known ? error.message : "Copacker could not complete this operation.",
          retryable: !known || error.status === 503,
          issues: [],
          recovery: null,
          details: {}
        },
        meta: { requestId, workspaceId }
      },
      { status: known ? error.status : 500, headers }
    )
  }
}
