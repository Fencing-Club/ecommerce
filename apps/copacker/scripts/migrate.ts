import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"
import { directDatabase } from "../src/db/connection"

const client = new Client(directDatabase())
await client.connect()
try {
  // One session owns the lock and runs Drizzle, including across its migration transactions.
  await client.query("SET lock_timeout = '120s'")
  await client.query("SELECT pg_advisory_lock(843947210, 1)")
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" })
    process.stdout.write("Copacker migrations applied.\n")
  } finally {
    await client.query("SELECT pg_advisory_unlock(843947210, 1)")
  }
} finally {
  await client.end()
}
