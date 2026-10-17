import { AsyncLocalStorage } from "node:async_hooks"
import { drizzle } from "drizzle-orm/node-postgres"
import type { PoolConfig } from "pg"
import { Pool } from "pg"
import { databaseConfig } from "./connection"
import * as schema from "./schema"
const invocation = new AsyncLocalStorage<Database | Transaction>()
let instance: ReturnType<typeof nodeDatabase> | undefined
function createDatabase(pool: Pool) {
  return drizzle(pool, { schema })
}
function nodeDatabase() {
  const pool = new Pool({
    ...databaseConfig(),
    max: 10,
    // Keepalive stops the database proxy from silently dropping idle connections.
    keepAlive: true
  })
  // An idle connection can still be terminated by the server or proxy. pg emits that on the pool, and an unhandled
  // 'error' event would exit the process. The pool already discards the broken client and reconnects on next use.
  pool.on("error", (error) => {
    console.error("Postgres idle connection error; the pool will reconnect.", error.message)
  })
  return { database: createDatabase(pool), pool }
}
export function db() {
  return invocation.getStore() ?? (instance ??= nodeDatabase()).database
}
export async function closeDatabase() {
  const open = instance
  instance = undefined
  await open?.pool.end()
}
// A Worker invocation owns its sockets. Domain queries stay shared with the retained Node worker, whose pool is
// process-scoped. Await every query in `run`; never return a deferred query or use this context from background work.
export async function withDatabase<T>(config: PoolConfig, run: () => Promise<T>): Promise<T> {
  const pool = new Pool({ ...config, max: 2, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000 })
  pool.on("error", (error) => console.error("Postgres invocation connection error.", error.message))
  try {
    return await invocation.run(createDatabase(pool), run)
  } finally {
    await pool.end()
  }
}
// Domain reads inside a transaction must use its connection, including nested service calls.
export function withTransaction<T>(transaction: Transaction, run: () => Promise<T>) {
  return invocation.run(transaction, run)
}
export type Database = ReturnType<typeof createDatabase>
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
