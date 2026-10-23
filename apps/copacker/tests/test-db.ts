import { AsyncLocalStorage } from "node:async_hooks"
import { PGlite } from "@electric-sql/pglite"
import { getTableName } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach } from "vitest"
import * as schema from "../src/db/schema"
import { applySchema } from "./database"

// One embedded Postgres per test file. Vitest gives each file its own module graph, so files never share it, whichever
// worker or CI shard runs them.
export const pg = new PGlite()
export const database = drizzle(pg, { schema })

// The app's `db()`, for `vi.mock("@/db", () => import("./test-db"))`.
type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0]
const transactionContext = new AsyncLocalStorage<Transaction>()
export function db() {
  return transactionContext.getStore() ?? database
}
export function withTransaction<T>(transaction: Transaction, run: () => Promise<T>) {
  return transactionContext.run(transaction, run)
}

// Creates the schema from src/db/schema.ts before the tests and closes the database after them. Call it once per file.
// `truncate` empties tables before each test: `true` for every workspace's rows, or a list of tables.
export function setUpTestDatabase({ truncate = false }: { truncate?: boolean | PgTable[] } = {}) {
  beforeAll(async () => {
    await applySchema(pg)
  })
  afterAll(async () => {
    await pg.close()
  })
  if (truncate) {
    const tables = truncate === true ? [schema.organizations] : truncate
    const statement = `TRUNCATE ${tables.map((table) => `"${getTableName(table)}"`).join(", ")} CASCADE`
    beforeEach(async () => {
      await pg.exec(statement)
    })
  }
}
