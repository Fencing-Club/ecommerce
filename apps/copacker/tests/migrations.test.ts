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
  "0005_remove_suppliers": "c05e78bf10ec643b4ac138629b6701186e51321627b43dab3f1cf6be71bc3f0b",
  "0006_delivery_locations": "99e951940f2e859d95c40c92d358fc772e5a1ea62e57e775ddd5c10ac48d62d4",
  "0007_case_packs": "c30cae249d12d73cfc96b1311a84b38ac792013348a5a39242f415c5fe540a2e",
  "0008_sales_orders": "8ecc769736c46307d7484a79872f045f3f32f34a86bd79e33769731c42430045",
  "0009_supplier_lead_times": "93a13cb374bd2ba7bc78be1d7e1cc4e4e5ae29f5944777465586bc8df53ab622",
  "0010_stock_days": "6286013367697cea5f69417dc5f6e9d47602b6b10b282d8a65bdbf03c48f2310",
  "0011_product_supplier": "d6940a53b37a6e17726084db3174757737f95fb6aecb53c6848b615307713d97",
  "0012_product_barcodes": "17c853f1d41791f247ed8f80c17fc9f58440dfa8240feb3c70678475623f6a9e",
  "0013_overview_finance": "9846c6286d4dde1420e6f4be8b92e144ec1e3e2384fcf0247cf94d53dbb9a2d7",
  "0014_landed_costs": "0013865e698965cda40f9c5fe5daaaf6fdbf7cb71adf1558d2f2f2db68035953",
  "0015_product_label_source": "676864851442ea2b7489331a2aca7479f562b653605a3da94c0afbb320d41b8e"
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
