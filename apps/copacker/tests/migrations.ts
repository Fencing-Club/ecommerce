import { readFile } from "node:fs/promises"
import journal from "../drizzle/meta/_journal.json"

// Every migration in journal order, as deploys apply them.
export async function migrationSql() {
  return Promise.all(
    journal.entries.map((entry) => readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"))
  )
}

export async function applyMigrations(database: { exec: (sql: string) => Promise<unknown> }) {
  for (const sql of await migrationSql()) {
    await database.exec(sql)
  }
}
