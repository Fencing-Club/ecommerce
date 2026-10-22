import { getTableColumns, sql, type Table } from "drizzle-orm"
import { objectFromEntries } from "ts-extras"

// An upsert's `set` that takes these columns from the row being inserted: `excluded."column"` for each one.
export function excluded<T extends Table, K extends keyof T["_"]["columns"] & string>(table: T, ...columns: K[]) {
  const all = getTableColumns(table)
  return objectFromEntries(columns.map((key) => [key, sql`excluded.${sql.identifier(all[key].name)}`] as const))
}

// Rows in batches of `size`, so one insert stays under Postgres's limit of 65,535 parameters.
export function* chunked<T>(rows: readonly T[], size: number) {
  for (let index = 0; index < rows.length; index += size) {
    yield rows.slice(index, index + size)
  }
}
