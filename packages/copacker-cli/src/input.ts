import { clientError } from "@repo/copacker-client"
import { jsonObject, type CommandDefinition, type JsonObject } from "@repo/copacker-contract"
import { z } from "zod"

export const optionsSchema = z
  .object({
    workspace: z.string().optional(),
    profile: z.string().optional(),
    apiUrl: z.string().optional(),
    json: z.boolean().optional(),
    format: z.enum(["table", "json", "csv"]).optional(),
    input: z.string().optional(),
    output: z.string().optional(),
    overwrite: z.boolean().optional(),
    all: z.boolean().optional(),
    requireComplete: z.boolean().optional(),
    wait: z.boolean().optional(),
    timeout: z.string().optional(),
    dryRun: z.boolean().optional(),
    preview: z.string().optional(),
    batchId: z.string().optional(),
    exportId: z.string().optional(),
    fileFormat: z.string().optional(),
    idempotencyKey: z.string().optional(),
    yes: z.boolean().optional(),
    secretFile: z.string().optional(),
    storeAs: z.string().optional(),
    browser: z.boolean().optional()
  })
  .catchall(z.union([z.string(), z.boolean(), z.array(z.string())]))
export type Options = z.infer<typeof optionsSchema>

export const booleanFlags = new Set(["unlinked", "joined", "reviewed", "update-cost"])
export const numberFlags = new Set([
  "limit",
  "revision",
  "po-revision",
  "days",
  "lead-time-days",
  "quantity",
  "delta",
  "expected-quantity",
  "pieces-per-listing",
  "overlap-seconds"
])
export function camel(value: string) {
  return value.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
}
const fieldNames: Record<string, string> = {
  connection: "connectionId",
  marketplace: "marketplaceId",
  supplier: "supplierId",
  forwarder: "forwarderId",
  po: "poId",
  shipment: "shipmentId",
  order: "orderId",
  location: "locationId",
  variant: "variantId",
  product: "productId",
  catalog: "catalogId",
  image: "imageId",
  line: "lineId",
  document: "documentId",
  revision: "expectedRevision",
  "po-revision": "expectedPoRevision",
  snapshot: "snapshotId",
  "expected-account": "expectedAccountId",
  "cost-preview": "costPreviewId",
  "from-report": "reportId",
  scope: "scopes"
}

export function decimalMinor(amount: string, currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw clientError("invalid_input", "Currency must be an uppercase three-letter code.")
  }
  const places =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(amount)
  if (!match || amount.length > 30 || (match[2]?.length ?? 0) > places) {
    throw clientError(
      "invalid_input",
      `Enter a nonnegative amount with at most ${places} decimal places for ${currency}.`
    )
  }
  const minor = BigInt(match[1]!) * 10n ** BigInt(places) + BigInt((match[2] ?? "").padEnd(places, "0") || "0")
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw clientError("invalid_input", "The amount exceeds the supported range.")
  }
  return Number(minor)
}

function add(input: JsonObject, key: string, value: JsonObject[string]) {
  if (Object.hasOwn(input, key)) {
    throw clientError("invalid_input", `Supply ${key} once, using either JSON input or an argument.`)
  }
  Object.defineProperty(input, key, { value, writable: true, enumerable: true, configurable: true })
}

export function buildInput(
  definition: CommandDefinition,
  options: Options,
  args: readonly string[],
  initial: JsonObject = {}
): { input: JsonObject; file?: string } {
  const input: JsonObject = { ...initial }
  let file: string | undefined
  let index = 0
  if (definition.positional && args[index]) {
    const value = args[index++]!
    if (definition.positional === "reference") {
      add(input, z.uuid().safeParse(value).success ? "id" : "reference", value)
    } else {
      add(input, definition.positional, value)
    }
  }
  if (definition.upload) {
    file = args[index++]
  }
  if (args.length > index) {
    throw clientError("invalid_input", "Too many positional arguments.")
  }
  for (const flag of definition.flags) {
    if (["amount", "file-format", "expires-in"].includes(flag)) {
      continue
    }
    const value = options[camel(flag)]
    if (value === undefined) {
      continue
    }
    let key = fieldNames[flag] ?? camel(flag)
    if (flag === "state" && definition.operation.startsWith("inventory.")) {
      key = "quantityState"
    }
    if (
      flag === "state" &&
      (definition.operation.startsWith("product.") ||
        definition.operation.startsWith("catalog.") ||
        definition.operation === "report.restock")
    ) {
      key = "status"
    }
    if (flag === "channel" && definition.operation === "report.restock") {
      key = "channelIds"
    }
    if (flag === "channel" && definition.operation === "report.demand") {
      key = "channelId"
    }
    let converted = value
    if (numberFlags.has(flag)) {
      if (typeof value !== "string" || !/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw clientError("invalid_input", `--${flag} must be a safe integer.`)
      }
      add(input, key, Number(value))
      continue
    }
    if (key === "channelIds" && typeof value === "string") {
      converted = [value]
    }
    add(input, key, converted)
  }
  if (options.amount !== undefined) {
    if (typeof options.amount !== "string" || typeof input.currency !== "string") {
      throw clientError("invalid_input", "--amount requires a currency.")
    }
    add(input, "amountMinor", decimalMinor(options.amount, input.currency))
  }
  if (options.expiresIn !== undefined) {
    if (typeof options.expiresIn !== "string") {
      throw clientError("invalid_input", "Use --expires-in with hours or days, such as 30d.")
    }
    const match = /^(\d+)(h|d)$/.exec(options.expiresIn)
    const seconds = match ? Number(match[1]) * (match[2] === "d" ? 86400 : 3600) : 0
    if (seconds < 3600 || seconds > 90 * 86400) {
      throw clientError("invalid_input", "Credential expiry must be between one hour and 90 days.")
    }
    add(input, "expiresAt", new Date(Date.now() + seconds * 1000).toISOString())
  }
  if (definition.operation === "partners.create") {
    const data = jsonObject.safeParse(input.data)
    const top = ["type", "name", "email"].filter((key) => Object.hasOwn(input, key))
    if (top.length && data.success) {
      throw clientError("invalid_input", "Supply partner details either in data or with flags.")
    }
    if (top.length) {
      input.data = Object.fromEntries(top.map((key) => [key, input[key]!]))
      for (const key of top) {
        delete input[key]
      }
    }
  }
  if (options.exportId) {
    if (
      !definition.export ||
      Object.keys(input).length ||
      options.fileFormat ||
      options.preview ||
      options.dryRun ||
      options.batchId ||
      file
    ) {
      throw clientError("invalid_input", "--export-id cannot accompany generation inputs.")
    }
    return { input: { action: "read", exportId: options.exportId } }
  }
  if (options.batchId) {
    if (
      !definition.bulk ||
      Object.keys(input).length ||
      options.preview ||
      options.dryRun ||
      options.fileFormat ||
      file
    ) {
      throw clientError("invalid_input", "--batch-id cannot accompany new values or a preview.")
    }
    return { input: { mode: "read", batchId: options.batchId } }
  }
  if (options.preview) {
    if (
      !definition.preview ||
      options.dryRun ||
      Object.keys(input).some((key) => key !== "id" && key !== "variantId")
    ) {
      throw clientError("invalid_input", "--preview applies one immutable preview; omit new values and revision flags.")
    }
    return { input: { mode: "apply", previewId: options.preview, ...input } }
  }
  if (options.dryRun && !definition.preview) {
    throw clientError("invalid_input", "This operation does not support --dry-run. Use its check or review operation.")
  }
  if (definition.preview && !Object.hasOwn(input, "mode") && !Object.hasOwn(input, "data")) {
    input.mode = options.dryRun ? "preview" : "direct"
  } else if (options.dryRun && input.mode !== "preview") {
    throw clientError("invalid_input", "--dry-run conflicts with the input mode.")
  }
  if (options.fileFormat) {
    if (definition.export) {
      if (Object.hasOwn(input, "action") || Object.hasOwn(input, "fileFormat")) {
        throw clientError("invalid_input", "Supply export format and selection once.")
      }
      return { input: { action: "generate", selection: input, fileFormat: options.fileFormat }, file }
    }
    if (!definition.flags.includes("file-format")) {
      throw clientError("invalid_input", "This command does not accept --file-format.")
    }
    add(input, "fileFormat", options.fileFormat)
  }
  if (definition.upload && !file && input.source !== "shopify" && input.phase !== "complete") {
    throw clientError("invalid_input", "Supply a local file path for this upload.")
  }
  return { input, file }
}
