import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { orderInputSchema } from "@repo/aisle"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Miniflare, Response } from "miniflare"
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
let notificationReads = 0
let emailDeliveries = 0
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
          exports: { JobWorkflow: { type: "workflow", name: "fixture-job-workflow" } },
          compatibilityDate: artifact.compatibilityDate,
          compatibilityFlags: artifact.compatibilityFlags,
          manifest: { mainModule: artifact.manifest.mainModule, modules },
          env: {
            AWS_REGION: { type: "text", value: "us-west-2" },
            AWS_NOTIFICATION_ACCESS_KEY_ID: { type: "text", value: "fixture-access-key" },
            AWS_NOTIFICATION_SECRET_ACCESS_KEY: { type: "text", value: "fixture-secret-key" },
            AMAZON_NOTIFICATIONS_QUEUE_URL: {
              type: "text",
              value: "https://sqs.us-west-2.amazonaws.com/123456789012/amazon"
            },
            SHOPIFY_EVENTS_QUEUE_URL: {
              type: "text",
              value: "https://sqs.us-west-2.amazonaws.com/123456789012/shopify"
            },
            EBAY_EVENTS_QUEUE_URL: { type: "text", value: "https://sqs.us-west-2.amazonaws.com/123456789012/ebay" },
            APP_URL: { type: "text", value: "https://copacker.test" },
            EMAIL_API_KEY: { type: "text", value: "fixture-email-key" },
            EMAIL_FROM: { type: "text", value: "fixture@example.test" },
            DEPLOYMENT_ENV: { type: "text", value: "local" },
            HYPERDRIVE: { type: "json", value: { connectionString: connection.href } },
            DOCUMENTS: { type: "r2", name: "fixture-documents" },
            JOB_WORKFLOW: {
              type: "workflow",
              name: "fixture-job-workflow",
              worker: "copacker-jobs-regression",
              exportName: "JobWorkflow"
            },
            EXECUTOR_JOBS: { type: "queue", name: "fixture-cloudflare-jobs" }
          }
        },
        dev: {
          rootPath: fileURLToPath(output),
          outboundService: {
            type: "fetcher",
            async handler(request) {
              if (request.url === "https://api.resend.com/emails") {
                const email = z
                  .object({ to: z.array(z.string()), attachments: z.array(z.object({ content: z.string() })) })
                  .parse(await request.json())
                assert.deepEqual(email.to, ["fixture@example.test"])
                assert.equal(email.attachments.length, 1)
                assert.equal(Buffer.from(email.attachments[0]!.content, "base64").subarray(0, 4).toString(), "%PDF")
                assert(request.headers.get("idempotency-key"))
                emailDeliveries++
                return Response.json({ id: "fixture-email" })
              }
              assert.equal(
                new URL(request.url).origin,
                "https://sqs.us-west-2.amazonaws.com",
                "Unexpected external request"
              )
              assert.equal(request.headers.get("x-amz-target"), "AmazonSQS.ReceiveMessage")
              assert.match(request.headers.get("authorization") ?? "", /AWS4-HMAC-SHA256 Credential=fixture-access-key/)
              const body = z
                .object({ WaitTimeSeconds: z.number(), MaxNumberOfMessages: z.number() })
                .parse(await request.json())
              assert.equal(body.WaitTimeSeconds, 0)
              assert.equal(body.MaxNumberOfMessages, 10)
              notificationReads++
              return Response.json({ Messages: [] })
            }
          }
        }
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
  for (const provider of ["amazon", "shopify", "ebay"]) {
    const result = queueResult.parse(
      await dispatchQueue("fixture-cloudflare-jobs", [
        {
          id: randomUUID(),
          timestamp: new Date(),
          body: JSON.stringify({ kind: "notifications", provider }),
          attempts: 1
        }
      ])
    )
    assert.equal(result.outcome, "ok")
  }
  assert.equal(notificationReads, 3, "Every notification provider must read one signed AWS batch")
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
  const workflowJob = await insert("import", { id: randomUUID(), revision: 1 })
  assert.equal((await wake()).outcome, "ok")
  const deadline = Date.now() + 30000
  while ((await state(workflowJob)).status === "running" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.deepEqual(
    await state(workflowJob),
    { status: "complete", attempts: 1 },
    "Workflow did not execute the long-job claim"
  )
  assert.equal((await wake()).outcome, "ok")
  assert.deepEqual(await state(workflowJob), { status: "complete", attempts: 1 })
  const abandoned = await insert("ebay-event", { orgId, userId: "disconnected-fixture" }, "running", 1)
  assert.equal((await wake()).outcome, "ok")
  assert.deepEqual(await state(abandoned), { status: "complete", attempts: 2 })

  // A connected event commits downstream work and publishes through its native queue binding.
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
  await database
    .update(tables.jobs)
    .set({ runAt: new Date(Date.now() + 3600000) })
    .where(eq(tables.jobs.kind, "sales"))

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

  await database
    .update(tables.jobs)
    .set({ runAt: new Date(Date.now() + 3600000) })
    .where(eq(tables.jobs.kind, "sales"))

  // Exercise PDF generation, R2 write/read and React email rendering inside actual Workflow steps.
  const supplierId = randomUUID()
  const orderId = randomUUID()
  const order = orderInputSchema.parse({
    supplierId,
    reference: "PO-WORKFLOW",
    destination: "amazon",
    currency: "USD",
    items: [
      {
        id: randomUUID(),
        variantId: "gid://shopify/ProductVariant/1",
        inventoryItemId: "gid://shopify/InventoryItem/1",
        name: "Workflow fixture",
        variant: "Default Title",
        buyerSku: "FIXTURE",
        supplierSku: "FIXTURE",
        asin: "B000000001",
        fnsku: "X000000001",
        pieces: 10,
        piecesPerSet: 1,
        unitPrice: 100,
        amazonNetwork: "awd_us"
      }
    ]
  })
  await database.insert(tables.suppliers).values({ id: supplierId, buyerOrgId: orgId, name: "Fixture supplier" })
  await database
    .insert(tables.orders)
    .values({ id: orderId, buyerOrgId: orgId, supplierId, shopifyDomain: "fixture.myshopify.com", data: order })
  await database
    .insert(tables.orderRevisions)
    .values({ orderId, revision: 1, data: order, actor: "fixture", reason: "created" })
  for (let index = 0; index < 2; index++) {
    const id = await insert("email", { type: "po", to: "fixture@example.test", orderId, revision: 1 })
    assert.equal((await wake()).outcome, "ok")
    const deadline = Date.now() + 30000
    while ((await state(id)).status === "running" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.deepEqual(await state(id), { status: "complete", attempts: 1 }, "Document/email Workflow failed")
  }
  assert.equal(emailDeliveries, 2)
  const documents = await database.select().from(tables.documents).where(eq(tables.documents.orderId, orderId))
  assert.equal(documents.length, 1, "Second Workflow should reuse the filed PDF from native R2")

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
    "Built Worker jobs passed: signed AWS readers, native R2 PDF creation/reuse, rendered email, bounded families, Workflow dispatch, downstream publication, delayed retry, duplicate delivery, abandoned lease, database failure and recovery.\n"
  )
} finally {
  await runtime?.dispose()
  await client.end()
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
  await admin.end()
}
