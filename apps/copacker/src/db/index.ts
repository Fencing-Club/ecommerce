import { AsyncLocalStorage } from "node:async_hooks"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool, type PoolConfig } from "pg"
import * as schema from "./schema"
const invocation = new AsyncLocalStorage<ReturnType<typeof createDatabase>>()
let instance: ReturnType<typeof createDatabase> | undefined
function createDatabase(pool: Pool) {
  return drizzle(pool, { schema })
}
function nodeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured")
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    // Keepalive stops the database proxy from silently dropping idle connections.
    keepAlive: true,
    ssl: process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true } : undefined
  })
  // An idle connection can still be terminated by the server or proxy. pg emits that on the pool, and an unhandled
  // 'error' event would exit the process. The pool already discards the broken client and reconnects on next use.
  pool.on("error", (error) => {
    console.error("Postgres idle connection error; the pool will reconnect.", error.message)
  })
  return createDatabase(pool)
}
export function db() {
  return invocation.getStore() ?? (instance ??= nodeDatabase())
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
export type Database = ReturnType<typeof db>
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
