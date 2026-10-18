import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { describe, expect, it } from "vitest"
import journal from "../drizzle/meta/_journal.json"
import * as schema from "../src/db/schema"

describe("migrations", () => {
  // The migrator runs only the entries made after the last one a database applied, so a migration numbered after
  // another but made before it would be skipped without an error. Regenerate it rather than renumbering it.
  it("are numbered in the order they were made", () => {
    const problems = journal.entries.flatMap((entry, index) => {
      const previous = journal.entries[index - 1]
      return [
        ...(entry.idx === index ? [] : [`${entry.tag} is numbered ${entry.idx}, not ${index}`]),
        ...(previous && entry.when <= previous.when ? [`${entry.tag} was made before ${previous.tag}`] : [])
      ]
    })
    expect(problems).toEqual([])
  })

  it("cover every schema change", async () => {
    const latest = journal.entries.at(-1)
    const snapshot = JSON.parse(
      await readFile(
        new URL(`../drizzle/meta/${String(latest?.idx).padStart(4, "0")}_snapshot.json`, import.meta.url),
        "utf8"
      )
    )
    const statements = await generateMigration(snapshot, generateDrizzleJson(schema, snapshot.id))
    // Any statement here means schema.ts changed without a migration; run pnpm db:generate.
    expect(statements).toEqual([])
  })

  it("initializes an empty database and can run again without losing data", async () => {
    const pg = new PGlite()
    try {
      const database = drizzle(pg)
      const options = { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) }
      await migrate(database, options)
      await pg.exec(`INSERT INTO exchange_rates (day, currency, "perUsd") VALUES ('2026-10-01', 'CAD', 1.4)`)
      await migrate(database, options)
      const result = await pg.query<{ rate: string }>(
        `SELECT fx_rate('USD', 'CAD', '2026-10-01'::timestamptz)::text AS rate`
      )
      expect(Number(result.rows[0]?.rate)).toBe(1.4)
      const columns = await pg.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'paymentTerms'`
      )
      expect(columns.rows).toEqual([])
    } finally {
      await pg.close()
    }
  })
})
