// Comments can contain quoted tabs/newlines. Parse the complete document before accepting any rows.
function records(text: string) {
  const rows: string[][] = []
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index++
        } else {
          quoted = false
          closed = true
        }
      } else {
        field += char
      }
    } else if (char === "\t" || char === "\n" || char === "\r") {
      row.push(field)
      field = ""
      closed = false
      if (char !== "\t") {
        if (char === "\r" && text[index + 1] === "\n") {
          index++
        }
        if (row.some((value) => value !== "")) {
          rows.push(row)
        }
        row = []
      }
    } else if (closed) {
      throw new Error("Invalid quoted report field")
    } else if (char === '"' && field === "") {
      quoted = true
    } else {
      field += char
    }
  }
  if (quoted) {
    throw new Error("Unclosed report field")
  }
  row.push(field)
  if (row.some((value) => value !== "")) {
    rows.push(row)
  }
  return rows
}

export function reportRows(text: string, required: readonly string[]) {
  const [header, ...rows] = records(text.replace(/^\uFEFF/, ""))
  if (!header || new Set(header).size !== header.length || required.some((name) => !header.includes(name))) {
    throw new Error("Missing or duplicate report columns")
  }
  return rows.map((row) => {
    if (row.length !== header.length) {
      throw new Error("Incomplete report row")
    }
    return Object.fromEntries(header.map((name, index) => [name, row[index]!]))
  })
}
