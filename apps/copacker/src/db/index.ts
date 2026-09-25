import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"
let instance: ReturnType<typeof createDatabase> | undefined
function createDatabase() {
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
  return drizzle(pool, { schema })
}
export function db() {
  return (instance ??= createDatabase())
}
export type Database = ReturnType<typeof db>
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
