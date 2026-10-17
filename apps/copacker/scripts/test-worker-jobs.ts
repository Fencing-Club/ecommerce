import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Miniflare } from "miniflare"
import { Client } from "pg"
import { z } from "zod"
import * as tables from "../src/db/schema"
import { artifact, modules, output } from "./worker-test-artifact"

// A fresh database and the exact built Worker exercise real PostgreSQL sockets, claims, leases and native delivery.
// Refuse hosted databases. No merchant credentials or external integrations are available to this test.
assert(process.env.TEST_DATABASE_URL, "Set TEST_DATABASE_URL to a local disposable PostgreSQL server")
const source = new URL(process.env.TEST_DATABASE_URL)
assert(["localhost", "127.0.0.1", "[::1]"].includes(source.hostname), "Worker tests require local PostgreSQL")
const databaseName = `copacker_worker_${randomUUID().replaceAll("-", "")}`
const admin = new Client({ connectionString: source.href })
const connection = new URL(source)
connection.pathname = `/${databaseName}`
const client = new Client({ connectionString: connection.href })
let runtime: Miniflare | undefined
await admin.connect()
try {
  await admin.query(`CREATE DATABASE ${databaseName}`)
  await client.connect()
  const database = drizzle(client, { schema: tables })
  await migrate(database, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) })
  runtime = new Miniflare({
    telemetry: { enabled: false },
    workers: [
      {
        config: {
          name: "copacker-jobs-regression",
          compatibilityDate: artifact.compatibilityDate,
          compatibilityFlags: artifact.compatibilityFlags,
          manifest: { mainModule: artifact.manifest.mainModule, modules },
          env: {
            DEPLOYMENT_ENV: { type: "text", value: "local" },
            HYPERDRIVE: { type: "json", value: { connectionString: connection.href } },
            JOBS: { type: "queue", name: "fixture-node-jobs" },
            EXECUTOR_JOBS: { type: "queue", name: "fixture-cloudflare-jobs" }
          }
        },
        dev: { rootPath: fileURLToPath(output) }
      }
    ]
  })
  const worker = await runtime.getWorker()
  // Miniflare exposes the experimental queue handler even when its public Fetcher types omit it.
  assert("queue" in worker && typeof worker.queue === "function")
  const dispatchQueue = worker.queue.bind(worker)
  const queueResult = z.object({ outcome: z.string(), explicitAcks: z.array(z.string()) })
  const wake = async () =>
    queueResult.parse(
      await dispatchQueue("fixture-cloudflare-jobs", [
        { id: randomUUID(), timestamp: new Date(), body: '{"kind":"wake"}', attempts: 1 }
      ])
    )
  const orgId = randomUUID()
  const insert = async (kind: string, payload: unknown, status = "pending", attempts = 0) => {
    const id = randomUUID()
    await client.query(
      `INSERT INTO jobs (id, key, kind, payload, status, attempts, "leaseAt") VALUES ($1::uuid, $1::text, $2, $3, $4, $5, now() - interval '11 minutes')`,
      [id, kind, payload, status, attempts]
    )
    return id
  }
  const state = async (id: string) =>
    (await client.query("SELECT status, attempts FROM jobs WHERE id = $1", [id])).rows[0]
  const retained = await insert("import", { orgId })
  for (const [kind, payload] of [
    ["ebay-event", { orgId, userId: "disconnected-fixture" }],
    ["shopify-event", { orgId, shop: "disconnected-fixture.myshopify.com", target: "stock" }],
    ["analytics", { orgId, externalAccountId: "disconnected-fixture.myshopify.com", revision: 1 }]
  ] as const) {
    const id = await insert(kind, payload)
    assert.equal((await wake()).outcome, "ok")
    assert.deepEqual(await state(id), { status: "complete", attempts: 1 })
    assert.equal((await wake()).outcome, "ok")
    assert.deepEqual(await state(id), { status: "complete", attempts: 1 }, "Duplicate delivery reran a completed job")
  }
  assert.deepEqual(await state(retained), { status: "pending", attempts: 0 }, "Cloudflare claimed a retained job")
  const abandoned = await insert("ebay-event", { orgId, userId: "disconnected-fixture" }, "running", 1)
  assert.equal((await wake()).outcome, "ok")
  assert.deepEqual(await state(abandoned), { status: "complete", attempts: 2 })

  // A connected event must commit downstream Node work and publish through both native queue bindings.
  await database.insert(tables.organizations).values({ id: orgId, name: "Worker fixture", kind: "buyer" })
  await database.insert(tables.connections).values({
    orgId,
    provider: "ebay",
    externalId: "fixture-seller",
    encryptedToken: "unused-fixture-token"
  })
  const event = await insert("ebay-event", { orgId, userId: "fixture-seller" })
  assert.equal((await wake()).outcome, "ok")
  assert.deepEqual(await state(event), { status: "complete", attempts: 1 })
  const downstream = await database.select().from(tables.jobs).where(eq(tables.jobs.kind, "sales"))
  assert.equal(downstream.length, 1)
  assert.equal(downstream[0]?.status, "pending")

  await database.update(tables.salesSyncs).set({ status: "running" }).where(eq(tables.salesSyncs.orgId, orgId))
  const delayed = await insert("ebay-event", { orgId, userId: "fixture-seller" })
  assert.equal((await wake()).outcome, "ok")
  assert.deepEqual(await state(delayed), { status: "pending", attempts: 1 })
  const [waiting] = await database.select().from(tables.jobs).where(eq(tables.jobs.id, delayed))
  assert(waiting && waiting.runAt.getTime() > Date.now(), "Retry did not persist its delay")
  assert.equal((await wake()).outcome, "ok")
  assert.deepEqual(await state(delayed), { status: "pending", attempts: 1 }, "An early wake bypassed the retry delay")
  await database.update(tables.salesSyncs).set({ status: "idle" }).where(eq(tables.salesSyncs.orgId, orgId))
  await database
    .update(tables.jobs)
    .set({ runAt: new Date(0) })
    .where(eq(tables.jobs.id, delayed))
  assert.equal((await wake()).outcome, "ok")
  assert.deepEqual(await state(delayed), { status: "complete", attempts: 2 })

  // A database outage must leave the signal retryable, including when the Worker has previously opened sockets.
  await client.query("ALTER TABLE jobs RENAME TO jobs_unavailable")
  try {
    const failed = await wake()
    assert.equal(failed.outcome, "exception")
    assert.deepEqual(failed.explicitAcks, [])
  } finally {
    await client.query("ALTER TABLE jobs_unavailable RENAME TO jobs")
  }
  const recovered = await insert("ebay-event", { orgId, userId: "disconnected-fixture" })
  assert.equal((await wake()).outcome, "ok")
  assert.deepEqual(await state(recovered), { status: "complete", attempts: 1 })
  process.stdout.write(
    "Built Worker jobs passed: three families, downstream publication, delayed retry, duplicate delivery, abandoned lease, database failure and recovery.\n"
  )
} finally {
  await runtime?.dispose()
  await client.end()
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
  await admin.end()
}
