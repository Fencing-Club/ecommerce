import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { databaseConfig } from "./connection"
import * as schema from "./schema"
let instance: ReturnType<typeof createDatabase> | undefined
function createDatabase() {
  const pool = new Pool(databaseConfig())
  // An idle connection can still be terminated by the server or proxy. pg emits that on the pool, and an unhandled
  // 'error' event would exit the process. The pool already discards the broken client and reconnects on next use.
  pool.on("error", (error) => {
    console.error("Postgres idle connection error; the pool will reconnect.", error.message)
  })
  return drizzle(pool, { schema })
}
export function db() {
  return (instance ??= createDatabase())
}
export type Database = ReturnType<typeof db>
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
