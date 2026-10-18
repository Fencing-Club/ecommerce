import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"
import journal from "../drizzle/meta/_journal.json" with { type: "json" }
import { databaseConfig } from "../src/db/connection"

const client = new Client(databaseConfig("migration"))
await client.connect()
try {
  // One session owns the lock and runs Drizzle, including across its migration transactions.
  await client.query("SET lock_timeout = '120s'")
  await client.query("SELECT pg_advisory_lock(843947210, 1)")
  try {
    const history = await client.query<{ name: string | null }>(
      "select to_regclass('drizzle.__drizzle_migrations') as name"
    )
    if (history.rows[0]?.name) {
      const first = await client.query<{ created_at: string }>(
        "select created_at from drizzle.__drizzle_migrations order by created_at limit 1"
      )
      if (first.rows.length && Number(first.rows[0]?.created_at) !== journal.entries[0]?.when) {
        throw new Error(
          "This database uses a different migration baseline. Provision a fresh database or explicitly authorize a reset before deploying. See docs/operations.md."
        )
      }
    }
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" })
    process.stdout.write("Copacker migrations applied.\n")
  } finally {
    await client.query("SELECT pg_advisory_unlock(843947210, 1)")
  }
} finally {
  await client.end()
}
