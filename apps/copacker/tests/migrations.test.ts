import { createHash, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api"
import { describe, expect, it } from "vitest"
import journal from "../drizzle/meta/_journal.json"
import * as schema from "../src/db/schema"
import { migrationSql } from "./migrations"

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
  "0015_product_label_source": "676864851442ea2b7489331a2aca7479f562b653605a3da94c0afbb320d41b8e",
  "0016_shopify_balance": "6d8db37e608a1b47256c52438e4ad232174239e7514b5e7e7f109a8412aee478",
  "0017_finance_links": "7e1f7d65b9be8b96c807d5ed44e75f8866e82be39cc4affa1071de9ef6578a86"
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

  it("keys the timeline events and revisions recorded as English text", async () => {
    const pg = new PGlite()
    const steps = await migrationSql()
    const keyed = journal.entries.findIndex((entry) => entry.tag === "0041_localization")
    for (const step of steps.slice(0, keyed)) {
      await pg.exec(step)
    }
    // Rows without their order, which the foreign keys would otherwise need.
    await pg.exec("SET session_replication_role = replica")
    const orderId = randomUUID()
    const recorded = [
      "PO submitted to supplier",
      "Supplier set the ready date to 2026-10-20",
      "Supplier proposed changes: Two weeks later",
      "Supplier's changes approved; PO revision 3 published",
      "Packing submitted; split into FBA and AWD US shipments and queued for Amazon",
      "Packing submitted; Amazon AWD US creation queued",
      "Pacific Link shipped the goods: UPS 1Z999",
      "Something no one recognizes"
    ]
    for (const message of recorded) {
      await pg.query(`INSERT INTO "events" ("orderId", "actor", "message") VALUES ($1, 'user', $2)`, [orderId, message])
    }
    await pg.query(
      `INSERT INTO "events" ("orderId", "actor", "message", "kind") VALUES ($1, 'user', 'PO looks good', 'comment')`,
      [orderId]
    )
    for (const [index, reason] of [
      "PO created",
      "Purchase order edited",
      "Approved supplier commercial changes"
    ].entries()) {
      await pg.query(
        `INSERT INTO "order_revisions" ("orderId", "revision", "data", "actor", "reason") VALUES ($1, $2, '{}', 'user', $3)`,
        [orderId, index + 1, reason]
      )
    }
    await pg.exec(steps[keyed]!)
    const events = await pg.query<{ message: string | null; messageKey: string | null; messageValues: unknown }>(
      `SELECT "message", "messageKey", "messageValues" FROM "events" ORDER BY "created_at", "id"`
    )
    const byKey = (key: string | null) => events.rows.find((row) => row.messageKey === key)
    expect(byKey("submittedToSupplier")).toEqual({
      message: null,
      messageKey: "submittedToSupplier",
      messageValues: null
    })
    expect(byKey("readyDateSet")?.messageValues).toEqual({ date: "2026-10-20" })
    expect(byKey("changesProposedWithNote")?.messageValues).toEqual({ note: "Two weeks later" })
    expect(byKey("supplierChangesApproved")?.messageValues).toEqual({ revision: 3 })
    expect(byKey("packingSplit")?.messageValues).toEqual({ networks: ["FBA", "AWD US"] })
    expect(byKey("packingQueued")?.messageValues).toEqual({ network: "AWD US" })
    expect(byKey("forwarderShipped")?.messageValues).toEqual({ forwarder: "Pacific Link", tracking: "UPS 1Z999" })
    // What isn't recognized keeps its text, and a comment stays as its author wrote it.
    expect(
      events.rows
        .filter((row) => !row.messageKey)
        .map((row) => row.message)
        .toSorted()
    ).toEqual(["PO looks good", "Something no one recognizes"])
    const revisions = await pg.query<{ reason: string }>(`SELECT "reason" FROM "order_revisions"`)
    expect(revisions.rows.map((row) => row.reason).toSorted()).toEqual([
      "approvedCommercialChanges",
      "created",
      "edited"
    ])
  })
})
