import { inject } from "vitest"

// Creates the current schema in an empty test database. Tests never run or check migrations.
export async function applySchema(database: { exec: (sql: string) => Promise<unknown> }) {
  await database.exec(inject("databaseSchema"))
}
