import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api"
import { describe, expect, it } from "vitest"
import journal from "../drizzle/meta/_journal.json"
import * as schema from "../src/db/schema"

// Migrations that have run in production. Deploys skip a migration that already ran, so editing one here would leave
// production without the change; add a new migration with `pnpm db:generate` instead. Line endings are normalized
// because Windows checkouts use CRLF.
const applied: Record<string, string> = {
  "0000_copacker": "294906ff9375edefaba8e22358763e37eb091d7afc5e7ea9ef663a1ae5c85f6e",
  "0001_optional_amazon_seller": "bdd9c66153a5c4738722d4dc9c3d8e3ebeb68d2f9475211ca4420a6b758e16c2",
  "0002_loving_starfox": "3c23e5624beddf0042d8800838757242db1d25731de0c1ec10a15b241e560d50",
  "0003_tired_shape": "5a2c4cdc920b255481c4a7cc9b2899f081e50f64939661976a21feeb5b3bfb1c",
  "0004_product_defaults": "7fc8c3b103e5225ed9fae728dc98ddcf24fc10bf6b6eb93c2cf65520a238d839",
  "0005_remove_suppliers": "c05e78bf10ec643b4ac138629b6701186e51321627b43dab3f1cf6be71bc3f0b"
}

async function sha256(tag: string) {
  const sql = await readFile(new URL(`../drizzle/${tag}.sql`, import.meta.url), "utf8")
  return createHash("sha256").update(sql.replaceAll("\r\n", "\n")).digest("hex")
}

describe("migrations", () => {
  it("never change after they are applied", async () => {
    const problems = []
    for (const [tag, hash] of Object.entries(applied)) {
      if (!journal.entries.some((entry) => entry.tag === tag)) {
        problems.push(`${tag} is missing from the journal`)
      } else if ((await sha256(tag)) !== hash) {
        problems.push(`${tag} was edited; add a new migration instead`)
      }
    }
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
})
