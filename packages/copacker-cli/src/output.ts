import { clientError } from "@repo/copacker-client"
import { jsonObject, type SuccessEnvelope } from "@repo/copacker-contract"

// Terminal output must remove escape sequences and control bytes from source-provided text.
/* oxlint-disable no-control-regex */
const printable = (value: string) =>
  value.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|$))/g, "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
/* oxlint-enable no-control-regex */
const cell = (value: unknown): string =>
  value === null || value === undefined ? "" : printable(typeof value === "string" ? value : JSON.stringify(value))
function rows(data: SuccessEnvelope["data"]) {
  if (Array.isArray(data)) {
    return data
  }
  const object = jsonObject.safeParse(data)
  if (object.success) {
    if (Array.isArray(object.data.items)) {
      return object.data.items
    }
    if (Array.isArray(object.data.rows)) {
      return object.data.rows
    }
  }
  return [data]
}
function field(value: unknown, path: string): unknown {
  let current = value
  for (const key of path.split(".")) {
    const parsed = jsonObject.safeParse(current)
    if (!parsed.success) {
      return undefined
    }
    current = parsed.data[key]
  }
  return current
}

export function render(result: SuccessEnvelope, format: "table" | "json" | "csv", columns?: readonly string[]): string {
  if (format === "json") {
    return `${JSON.stringify(result)}\n`
  }
  const values = rows(result.data)
  if (format === "csv") {
    if (!columns?.length) {
      throw clientError("invalid_input", "This operation has no declared CSV columns. Use JSON or its export command.")
    }
    const escape = (value: unknown) => {
      if (value === null || value === undefined) {
        return ""
      }
      const text = typeof value === "string" ? value : JSON.stringify(value)
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
    }
    return `${[columns.join(","), ...values.map((row) => columns.map((column) => escape(field(row, column))).join(","))].join("\r\n")}\r\n`
  }
  const detail = jsonObject.safeParse(result.data)
  if (detail.success && !Array.isArray(detail.data.items) && !Array.isArray(detail.data.rows)) {
    return `${Object.entries(detail.data)
      .map(([key, value]) => `${key}: ${cell(value)}`)
      .join("\n")}\n`
  }
  if (!values.length) {
    return "No matching records.\n"
  }
  const first = jsonObject.safeParse(values[0])
  if (!first.success) {
    return `${values.map(cell).join("\n")}\n`
  }
  const chosen = columns?.length
    ? columns
    : Object.keys(first.data)
        .filter((key) => {
          const value = first.data[key]
          return value === null || typeof value !== "object"
        })
        .slice(0, 8)
  if (!chosen.length) {
    return `${printable(JSON.stringify(result.data, null, 2))}\n`
  }
  const table = [chosen, ...values.map((row) => chosen.map((column) => cell(field(row, column))))]
  const widths = chosen.map((_, index) => Math.min(60, Math.max(...table.map((row) => (row[index] ?? "").length))))
  return `${table
    .map((row) =>
      row
        .map((value, index) => {
          const width = widths[index] ?? 0
          return (value.length > width ? `${value.slice(0, width - 1)}…` : value).padEnd(width)
        })
        .join("  ")
        .trimEnd()
    )
    .join("\n")}\n`
}

export function safeMessage(message: string): string {
  return printable(message)
}
