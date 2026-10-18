import { createHash, randomUUID } from "node:crypto"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { describe, expect, it } from "vitest"
import journal from "../drizzle/meta/_journal.json"
import * as schema from "../src/db/schema"
import { migrationSql } from "./migrations"

// Migrations that have run in production. Deploys skip a migration that already ran, so editing one here would leave
// production without the change; add a new migration with `pnpm db:generate` instead. Line endings are normalized
// because Windows checkouts use CRLF.
const applied: Record<string, string> = {
  "0059_customer_coverage": "b33d7ae10731f6630e21d63a7bd4cf82203c09f8f4c43537d6c6aff650cb54c8",
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
      "Supplier shipped the goods",
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
    // The supplier Overview finds shipped goods by this key alone.
    expect(byKey("supplierShipped")).toEqual({ message: null, messageKey: "supplierShipped", messageValues: null })
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

  it("moves POs stopping at an address saved for a forwarder that has joined to the forwarder's own copy", async () => {
    const pg = new PGlite()
    const steps = await migrationSql()
    const moving = journal.entries.findIndex((entry) => entry.tag === "0042_joined_forwarder_stops")
    for (const step of steps.slice(0, moving)) {
      await pg.exec(step)
    }
    // Rows without their workspaces and suppliers, which the foreign keys would otherwise need.
    await pg.exec("SET session_replication_role = replica")
    const buyerOrg = randomUUID()
    const contact = async (orgId: string, name: string, forwarderId: string | null = null) => {
      const id = randomUUID()
      const address = { name, addressLine1: "1000 Siji Road", city: "Yiwu", postalCode: "322000", countryCode: "CN" }
      await pg.query(
        `INSERT INTO "contacts" ("id", "orgId", "name", "kind", "address", "forwarderId") VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, orgId, name, forwarderId ? "forwarder" : "delivery", JSON.stringify(address), forwarderId]
      )
      return id
    }
    // A PO stopping at a forwarder's address, with its first revision and a shipment.
    const order = async (forwarderId: string, addressId: string) => {
      const id = randomUUID()
      const data = JSON.stringify({ reference: "PO-1", via: { forwarderId, addressId } })
      await pg.query(
        `INSERT INTO "orders" ("id", "buyerOrgId", "supplierId", "shopifyDomain", "data") VALUES ($1, $2, $3, 'test.myshopify.com', $4)`,
        [id, buyerOrg, randomUUID(), data]
      )
      await pg.query(
        `INSERT INTO "order_revisions" ("orderId", "revision", "data", "actor", "reason") VALUES ($1, 1, $2, 'user', 'created')`,
        [id, data]
      )
      await pg.query(`INSERT INTO "shipments" ("orderId", "orderRevision", "snapshot") VALUES ($1, 1, $2)`, [id, data])
      return id
    }
    // Yiwu joined without addresses of its own, so joining copied the one saved for it. Ningbo already kept one, so
    // the address saved for it wasn't copied. Shanghai hasn't joined.
    const forwarder = async (name: string, forwarderOrgId: string | null) => {
      const id = randomUUID()
      await pg.query(
        `INSERT INTO "forwarders" ("id", "buyerOrgId", "forwarderOrgId", "name") VALUES ($1, $2, $3, $4)`,
        [id, buyerOrg, forwarderOrgId, name]
      )
      return id
    }
    const yiwuOrg = randomUUID(),
      ningboOrg = randomUUID()
    const yiwu = await forwarder("Yiwu Logistics", yiwuOrg),
      ningbo = await forwarder("Ningbo Freight", ningboOrg),
      shanghai = await forwarder("Shanghai Cargo", null)
    const yiwuCopy = await contact(yiwuOrg, "Yiwu warehouse")
    await contact(ningboOrg, "Main warehouse")
    const toYiwu = await order(yiwu, await contact(buyerOrg, "Yiwu warehouse", yiwu))
    const toNingbo = await order(ningbo, await contact(buyerOrg, "Ningbo port", ningbo))
    const shanghaiSaved = await contact(buyerOrg, "Pudong", shanghai)
    const toShanghai = await order(shanghai, shanghaiSaved)
    await pg.exec(steps[moving]!)

    const stops = async (orderId: string) =>
      (
        await pg.query(
          `SELECT o."data"->'via'->>'addressId' AS "order", r."data"->'via'->>'addressId' AS "revision",
             s."snapshot"->'via'->>'addressId' AS "shipment"
           FROM "orders" o JOIN "order_revisions" r ON r."orderId" = o."id" JOIN "shipments" s ON s."orderId" = o."id"
           WHERE o."id" = $1`,
          [orderId]
        )
      ).rows[0]
    const own = async (orgId: string) =>
      (
        await pg.query<{ id: string; name: string; kind: string }>(
          `SELECT "id", "name", "kind" FROM "contacts" WHERE "orgId" = $1 ORDER BY "name"`,
          [orgId]
        )
      ).rows
    expect(await own(yiwuOrg)).toEqual([{ id: yiwuCopy, name: "Yiwu warehouse", kind: "delivery" }])
    expect(await stops(toYiwu)).toEqual({ order: yiwuCopy, revision: yiwuCopy, shipment: yiwuCopy })
    // Ningbo keeps a copy of the address its PO stops at.
    const ningboCopy = (await own(ningboOrg)).find((row) => row.name === "Ningbo port")
    expect(ningboCopy).toMatchObject({ kind: "delivery" })
    expect(await stops(toNingbo)).toEqual({ order: ningboCopy?.id, revision: ningboCopy?.id, shipment: ningboCopy?.id })
    expect(await stops(toShanghai)).toEqual({ order: shanghaiSaved, revision: shanghaiSaved, shipment: shanghaiSaved })
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
    } finally {
      await pg.close()
    }
  })

  it("rejects malformed stored payments after the coverage migration without changing data", async () => {
    const folder = await mkdtemp(join(tmpdir(), "copacker-payments-"))
    const pg = new PGlite()
    try {
      const prior = journal.entries.filter((entry) => entry.idx < 60)
      await mkdir(join(folder, "meta"))
      await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: prior }))
      for (const entry of prior) {
        await cp(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), join(folder, `${entry.tag}.sql`))
      }
      const database = drizzle(pg)
      await migrate(database, { migrationsFolder: folder })
      await pg.exec(`
        INSERT INTO organizations (id, name, kind) VALUES ('00000000-0000-4000-8000-000000000001', 'Payments', 'buyer');
        INSERT INTO sales_orders ("orgId", source, "externalAccountId", "orderId", "orderedAt", data) VALUES
          ('00000000-0000-4000-8000-000000000001', 'shopify', 'payments.myshopify.com', 'retained-order', now(), '{}');
      `)
      const options = { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) }
      const fee = {
        amount: { amount: "1.23", currencyCode: "USD" },
        taxAmount: { amount: "0.00", currencyCode: "USD" }
      }
      const payment = { id: "gid://shopify/OrderTransaction/1", kind: "SALE", status: "SUCCESS", fees: [fee] }
      const malformed: unknown[] = [
        null,
        {},
        [null],
        [{}],
        [{ ...payment, id: undefined }],
        [{ ...payment, id: "" }],
        [{ ...payment, id: 1 }],
        [{ ...payment, kind: undefined }],
        [{ ...payment, kind: null }],
        [{ ...payment, status: undefined }],
        [{ ...payment, status: false }],
        [{ ...payment, fees: undefined }],
        [{ ...payment, fees: null }],
        [{ ...payment, fees: {} }],
        [{ ...payment, fees: Array.from({ length: 51 }, () => fee) }],
        [{ ...payment, fees: [null] }],
        [{ ...payment, fees: [{}] }],
        [{ ...payment, fees: [{ amount: fee.amount }] }],
        [{ ...payment, fees: [{ taxAmount: fee.taxAmount }] }]
      ]
      for (const key of ["amount", "taxAmount"]) {
        for (const money of [
          null,
          {},
          { amount: 1, currencyCode: "USD" },
          { amount: "NaN", currencyCode: "USD" },
          { amount: "1e3", currencyCode: "USD" },
          { amount: ".5", currencyCode: "USD" },
          { amount: "1", currencyCode: "US" },
          { amount: "1", currencyCode: 123 }
        ]) {
          malformed.push([{ ...payment, fees: [{ ...fee, [key]: money }] }])
        }
      }
      for (const transactions of malformed) {
        const data = { tags: [], lines: [], transactions, merchantNote: "Keep this evidence" }
        await pg.query(`UPDATE sales_orders SET data = $1::jsonb`, [JSON.stringify(data)])
        const before = (await pg.query(`SELECT to_jsonb(t) AS row FROM sales_orders t`)).rows
        await expect(migrate(database, options)).rejects.toMatchObject({
          cause: { message: expect.stringContaining("Stored Shopify payment data needs a refresh") }
        })
        expect((await pg.query(`SELECT to_jsonb(t) AS row FROM sales_orders t`)).rows).toEqual(before)
        expect((await pg.query(`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`)).rows).toEqual([
          { count: 60 }
        ])
      }
      const valid = {
        tags: [],
        lines: [],
        transactions: [
          payment,
          { ...payment, id: "other", fees: [] },
          {
            ...payment,
            id: "refund",
            fees: [
              { amount: { amount: "-1.23", currencyCode: "CAD" }, taxAmount: { amount: "0", currencyCode: "CAD" } }
            ]
          }
        ]
      }
      await pg.query(`UPDATE sales_orders SET data = $1::jsonb`, [JSON.stringify(valid)])
      const before = (await pg.query(`SELECT to_jsonb(t) AS row FROM sales_orders t`)).rows
      await migrate(database, options)
      await migrate(database, options)
      expect((await pg.query(`SELECT to_jsonb(t) AS row FROM sales_orders t`)).rows).toEqual(before)
      expect((await pg.query(`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`)).rows).toEqual([
        { count: journal.entries.length }
      ])
    } finally {
      await pg.close()
      await rm(folder, { recursive: true, force: true })
    }
  })

  it("upgrades a populated deployment without deleting records and rolls back incompatible data", async () => {
    const folder = await mkdtemp(join(tmpdir(), "copacker-migrations-"))
    const pg = new PGlite()
    try {
      const prior = journal.entries.filter((entry) => entry.idx < 59)
      await mkdir(join(folder, "meta"))
      await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: prior }))
      for (const entry of prior) {
        await cp(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), join(folder, `${entry.tag}.sql`))
      }
      const database = drizzle(pg)
      await migrate(database, { migrationsFolder: folder })
      await pg.exec(`
        INSERT INTO organizations (id, name, kind) VALUES ('00000000-0000-4000-8000-000000000001', 'Keep workspace', 'buyer');
        INSERT INTO suppliers (id, "buyerOrgId", name, "paymentTerms") VALUES
          ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Keep supplier', 'Net 45');
        INSERT INTO connections ("orgId", provider, "externalId", "encryptedToken") VALUES
          ('00000000-0000-4000-8000-000000000001', 'shopify', 'keep.myshopify.com', 'keep-encrypted-credential');
        INSERT INTO orders ("buyerOrgId", "supplierId", "shopifyDomain", data) VALUES
          ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'keep.myshopify.com', '{"notes":"keep authored order"}');
        INSERT INTO sales_syncs ("orgId", source, "externalAccountId", "dataVersion") VALUES
          ('00000000-0000-4000-8000-000000000001', 'shopify', 'keep.myshopify.com', 8);
        INSERT INTO sales_orders ("orgId", source, "externalAccountId", "orderId", "orderedAt", data) VALUES
          ('00000000-0000-4000-8000-000000000001', 'shopify', 'keep.myshopify.com', 'keep-order', now(),
           '{"tags":[],"transactions":[],"lines":[{"originalUnitPriceSet":{"shopMoney":{"amount":"19.99","currencyCode":"USD"}},"discountAllocations":[]}]}');
        INSERT INTO stock_snapshots ("orgId", source, "externalAccountId", "scopeKey", data) VALUES
          ('00000000-0000-4000-8000-000000000001', 'shopify', 'keep.myshopify.com', 'store',
           '{"rows":[{"productId":"product","productTitle":"Product","variantTitle":"Variant","imageUrl":null}]}');
      `)
      const options = { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) }
      const snapshot = async () =>
        (
          await pg.query(`SELECT jsonb_build_object(
          'organizations', (SELECT jsonb_agg(to_jsonb(t)) FROM organizations t),
          'suppliers', (SELECT jsonb_agg(to_jsonb(t)) FROM suppliers t),
          'connections', (SELECT jsonb_agg(to_jsonb(t)) FROM connections t),
          'orders', (SELECT jsonb_agg(to_jsonb(t)) FROM orders t),
          'sales_orders', (SELECT jsonb_agg(to_jsonb(t)) FROM sales_orders t),
          'stock_snapshots', (SELECT jsonb_agg(to_jsonb(t)) FROM stock_snapshots t),
          'sales_syncs', (SELECT jsonb_agg(to_jsonb(t) - 'customersIncluded') FROM sales_syncs t)
        ) AS data`)
        ).rows
      for (const [table, field] of [
        ["sales_orders", "tags"],
        ["sales_orders", "transactions"],
        ["stock_snapshots", "rows"]
      ]) {
        const saved = await pg.query<{ data: unknown }>(`SELECT data FROM ${table}`)
        await pg.exec(`UPDATE ${table} SET data = data - '${field}'`)
        const before = await snapshot()
        await expect(migrate(database, options)).rejects.toMatchObject({
          cause: { message: expect.stringContaining("Stored Shopify data needs a refresh") }
        })
        expect(await snapshot()).toEqual(before)
        expect((await pg.query(`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`)).rows).toEqual([
          { count: 59 }
        ])
        expect(
          (
            await pg.query(
              `SELECT column_name FROM information_schema.columns WHERE table_name = 'sales_syncs' AND column_name = 'customersIncluded'`
            )
          ).rows
        ).toEqual([])
        await pg.query(`UPDATE ${table} SET data = $1::jsonb`, [JSON.stringify(saved.rows[0]?.data)])
      }
      const before = await snapshot()
      await migrate(database, options)
      expect(await snapshot()).toEqual(before)
      expect((await pg.query(`SELECT "customersIncluded", "dataVersion" FROM sales_syncs`)).rows).toEqual([
        { customersIncluded: false, dataVersion: 8 }
      ])
      await migrate(database, options)
      expect(await snapshot()).toEqual(before)
      expect((await pg.query(`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`)).rows).toEqual([
        { count: journal.entries.length }
      ])
    } finally {
      await pg.close()
      await rm(folder, { recursive: true, force: true })
    }
  })
})
