import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"
import { databaseConfig } from "../src/db/connection"

const pool = new Pool(databaseConfig("migration"))
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" })
  process.stdout.write("Copacker migrations applied.\n")
} finally {
  await pool.end()
}
