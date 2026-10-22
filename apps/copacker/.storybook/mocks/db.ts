import { getTableName, isTable, type Table } from "drizzle-orm"

// The database for stories: a server component's query answers with the rows the story gave for its table, whatever
// the query's filters, joins or columns. With none given, a query finds nothing.
let tables = new Map<string, unknown[]>()

// The rows each table holds for the story, by table name, such as { contacts: [...] }. preview.tsx's loader sets them
// from the story's `db` parameter before every story, and empties them for a story without one.
export function mockRows(rows: Record<string, unknown[]>) {
  tables = new Map(Object.entries(rows))
}

function query(table?: string): unknown {
  const rows = () => Promise.resolve(table ? (tables.get(table) ?? []) : [])
  return new Proxy(() => undefined, {
    get: (_target, key) => {
      if (key === "then") {
        const promise = rows()
        return promise.then.bind(promise)
      }
      if (key === "from" || key === "update" || key === "insert" || key === "delete") {
        return (source: Table) => query(isTable(source) ? getTableName(source) : table)
      }
      return () => query(table)
    },
    apply: () => query(table)
  })
}

export function db() {
  return query() as never
}
