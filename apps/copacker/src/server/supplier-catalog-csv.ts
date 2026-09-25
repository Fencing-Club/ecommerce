import { createHash } from "node:crypto"
import { z } from "zod"

export const catalogHeaders = [
  "supplier_sku",
  "title",
  "currency",
  "price",
  "price_basis",
  "pieces_per_sellable_pack",
  "sellable_packs_per_case",
  "notes"
] as const
export const catalogTemplate = `${catalogHeaders.join(",")}\r\n`

type CatalogRow = {
  supplierSku: string
  title: string
  currency: string
  priceMinor: number | null
  priceBasis: string
  piecesPerSellablePack: number
  sellablePacksPerCase: number | null
  notes: string | null
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value)
  return /[",\r\n\t]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

// Excel treats formula-looking CSV text as an expression even when the field is quoted.
// A leading tab keeps it as text; the import parser already trims text identifiers and notes.
function safeCsvText(value: string | null) {
  return value !== null && /^\s*[=+\-@]/.test(value) ? `\t${value}` : value
}

function safeCsvSku(value: string) {
  return /^0\d+$/.test(value) || /^\d{12,}$/.test(value) ? `\t${value}` : safeCsvText(value)
}

export function exportSupplierCatalogCsv(rows: Iterable<CatalogRow>) {
  const lines = [catalogHeaders.join(",")]
  for (const row of rows) {
    lines.push(
      [
        safeCsvSku(row.supplierSku),
        safeCsvText(row.title),
        row.currency,
        row.priceMinor === null ? null : (row.priceMinor / 100).toFixed(2),
        row.priceBasis,
        row.piecesPerSellablePack,
        row.sellablePacksPerCase,
        safeCsvText(row.notes)
      ]
        .map(csvCell)
        .join(",")
    )
  }
  return `${lines.join("\r\n")}\r\n`
}

export function sameSupplierCatalogFields(current: CatalogRow & { active: number }, incoming: CatalogRow) {
  return (
    current.active === 1 &&
    current.title === incoming.title &&
    current.currency === incoming.currency &&
    current.priceMinor === incoming.priceMinor &&
    current.priceBasis === incoming.priceBasis &&
    current.piecesPerSellablePack === incoming.piecesPerSellablePack &&
    current.sellablePacksPerCase === incoming.sellablePacksPerCase &&
    current.notes === incoming.notes
  )
}

export function catalogRevisionHash(rows: Array<{ supplierSku: string; id: string; revision: number }>) {
  return createHash("sha256")
    .update(
      rows
        .map((row) => `${row.supplierSku}\0${row.id}\0${row.revision}`)
        .sort()
        .join("\n")
    )
    .digest("hex")
}

const positive = z.coerce.number<number>().int().positive().max(2147483647)
const rowSchema = z.object({
  supplier_sku: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(500),
  currency: z.enum(["USD", "CNY", "EUR", "GBP", "CAD", "AUD"]),
  price_basis: z.enum(["piece", "sellable_pack", "case"]),
  pieces_per_sellable_pack: positive,
  sellable_packs_per_case: z.union([positive, z.literal("").transform(() => null)]),
  notes: z.string().max(2000)
})

function rowsOf(text: string) {
  const rows: string[][] = []
  let row: string[] = [],
    cell = "",
    quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (quoted || cell === "") {
        quoted = !quoted
      } else {
        throw new Error(`Unexpected quote on row ${rows.length + 1}`)
      }
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(cell)
      cell = ""
      if (char !== ",") {
        if (row.some((value) => value.trim())) {
          rows.push(row)
        }
        row = []
        if (char === "\r" && text[i + 1] === "\n") {
          i++
        }
      }
    } else {
      cell += char
    }
  }
  if (quoted) {
    throw new Error("CSV has an unclosed quote")
  }
  row.push(cell)
  if (row.some((value) => value.trim())) {
    rows.push(row)
  }
  return rows
}

function minorUnits(value: string, row: number) {
  if (!value.trim()) {
    return null
  }
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new Error(`Row ${row}: price must be a nonnegative amount with at most two decimals`)
  }
  const [whole, fraction = ""] = value.trim().split(".")
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  if (amount > 2147483647) {
    throw new Error(`Row ${row}: price exceeds the supported range`)
  }
  return amount
}

export function parseSupplierCatalogCsv(text: string) {
  if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) {
    throw new Error("Catalog exceeds 2 MB")
  }
  const rows = rowsOf(text.replace(/^\uFEFF/, ""))
  const header = rows.shift()?.map((value) => value.trim())
  if (header?.join("\0") !== catalogHeaders.join("\0")) {
    throw new Error(`Use the catalog template headers: ${catalogHeaders.join(", ")}`)
  }
  if (rows.length > 5000) {
    throw new Error("Catalog exceeds 5,000 products")
  }
  const seen = new Set<string>()
  return rows.map((cells, index) => {
    const line = index + 2
    if (cells.length !== catalogHeaders.length) {
      throw new Error(`Row ${line}: expected ${catalogHeaders.length} columns`)
    }
    const raw = Object.fromEntries(catalogHeaders.map((key, position) => [key, cells[position]]))
    const parsed = rowSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(`Row ${line}: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`)
    }
    if (seen.has(parsed.data.supplier_sku)) {
      throw new Error(`Row ${line}: duplicate supplier SKU ${parsed.data.supplier_sku}`)
    }
    seen.add(parsed.data.supplier_sku)
    const priceMinor = minorUnits(cells[3]!, line)
    const { supplier_sku, title, currency, price_basis, pieces_per_sellable_pack, sellable_packs_per_case, notes } =
      parsed.data
    if (sellable_packs_per_case !== null && !Number.isSafeInteger(pieces_per_sellable_pack * sellable_packs_per_case)) {
      throw new Error(`Row ${line}: pack quantity exceeds the supported range`)
    }
    return {
      supplierSku: supplier_sku,
      title,
      currency,
      priceMinor,
      priceBasis: price_basis,
      piecesPerSellablePack: pieces_per_sellable_pack,
      sellablePacksPerCase: sellable_packs_per_case,
      notes: notes.trim() || null
    }
  })
}
