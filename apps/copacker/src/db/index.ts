import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"
let instance: ReturnType<typeof createDatabase> | undefined
function createDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured")
  }
  return drizzle(
    new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      ssl: process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true } : undefined
    }),
    { schema }
  )
}
export function db() {
  return (instance ??= createDatabase())
}
export type Database = ReturnType<typeof db>
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
