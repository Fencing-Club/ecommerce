import { LocalizedError } from "@/i18n/errors"

// CSV text as rows of cells.
export function csvTable(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (quoted || cell === "") {
        quoted = !quoted
      } else {
        throw new LocalizedError("csvUnexpectedQuote", { row: rows.length + 1 })
      }
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(cell)
      cell = ""
      if (char !== ",") {
        rows.push(row)
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
    throw new LocalizedError("csvUnclosedQuote")
  }
  row.push(cell)
  rows.push(row)
  return rows
}
