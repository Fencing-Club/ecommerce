import assert from "node:assert/strict"
import { createSign, generateKeyPairSync } from "node:crypto"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { Miniflare, Response } from "miniflare"
import { z } from "zod"

// Exercise the exact application artifact, including Vite's AWS package resolution. All bindings are synthetic and
// every outbound request is intercepted: this check cannot reach AWS, eBay, WorkOS or an application database.
const output = new URL("../.cloudflare/output/v0/workers/default/", import.meta.url)
const artifact = z
  .object({
    compatibilityDate: z.string(),
    compatibilityFlags: z.array(z.string()),
    manifest: z.object({
      mainModule: z.string(),
      modules: z.record(z.string(), z.object({ type: z.enum(["esm", "data", "text", "wasm", "sourcemap"]) }))
    })
  })
  .parse(JSON.parse(await readFile(new URL("worker.config.json", output), "utf8")))
const modules = Object.fromEntries(
  await Promise.all(
    Object.entries(artifact.manifest.modules)
      .filter(([, module]) => module.type !== "sourcemap")
      .map(async ([name, module]) => {
        assert(module.type !== "sourcemap")
        const bytes = await readFile(new URL(`bundle/${name}`, output))
        return [
          name,
          { type: module.type, contents: module.type === "esm" || module.type === "text" ? bytes.toString() : bytes }
        ]
      })
  )
)
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
const key = publicKey.export({ type: "spki", format: "pem" }).toString()
const notification = {
  metadata: { topic: "ORDER_CONFIRMATION" },
  notification: { notificationId: "worker-runtime-regression", data: { user: { userId: "synthetic-seller" } } }
}
const body = JSON.stringify(notification)
const signature = createSign("sha1").update(body).sign(privateKey, "base64")
const signed = Buffer.from(JSON.stringify({ alg: "ECDSA", kid: "fixture-key", signature, digest: "SHA1" })).toString(
  "base64"
)
let deliveries = 0
let rejectEntry = false
const runtime = new Miniflare({
  telemetry: { enabled: false },
  workers: [
    {
      config: {
        name: "copacker-webhook-regression",
        compatibilityDate: artifact.compatibilityDate,
        compatibilityFlags: artifact.compatibilityFlags,
        manifest: { mainModule: artifact.manifest.mainModule, modules },
        env: {
          APP_URL: { type: "text", value: "https://copacker.test" },
          DEPLOYMENT_ENV: { type: "text", value: "local" },
          HYPERDRIVE: { type: "json", value: { connectionString: "postgres://fixture:fixture@127.0.0.1:1/fixture" } },
          EBAY_CLIENT_ID: { type: "text", value: "fixture-ebay-client" },
          EBAY_CLIENT_SECRET: { type: "text", value: "fixture-ebay-secret" },
          EBAY_RU_NAME: { type: "text", value: "fixture-ebay-return" },
          EBAY_EVENT_BUS: { type: "text", value: "fixture-event-bus" },
          AWS_REGION: { type: "text", value: "us-west-2" },
          AWS_ACCESS_KEY_ID: { type: "text", value: "fixture-access-key" },
          AWS_SECRET_ACCESS_KEY: { type: "text", value: "fixture-secret-key" },
          AWS_SESSION_TOKEN: { type: "text", value: "fixture-session-token" }
        }
      },
      dev: {
        rootPath: fileURLToPath(output),
        outboundService: {
          type: "fetcher",
          async handler(request) {
            const url = new URL(request.url)
            if (url.href === "https://api.ebay.com/identity/v1/oauth2/token") {
              return Response.json({ access_token: "fixture-ebay-token", expires_in: 3600 })
            }
            if (url.href === "https://api.ebay.com/commerce/notification/v1/public_key/fixture-key") {
              return Response.json({ algorithm: "ECDSA", digest: "SHA1", key })
            }
            assert.equal(url.origin, "https://events.us-west-2.amazonaws.com", "Unexpected outbound request")
            assert.equal(request.method, "POST")
            assert.equal(request.headers.get("x-amz-target"), "AWSEvents.PutEvents")
            assert.equal(request.headers.get("x-amz-security-token"), "fixture-session-token")
            assert.match(
              request.headers.get("authorization") ?? "",
              /AWS4-HMAC-SHA256 Credential=fixture-access-key\/\d{8}\/us-west-2\/events\/aws4_request,.*Signature=[a-f0-9]{64}$/
            )
            assert.deepEqual(await request.json(), {
              Entries: [
                {
                  EventBusName: "fixture-event-bus",
                  Source: "copacker.ebay",
                  DetailType: "ORDER_CONFIRMATION",
                  Detail: body
                }
              ]
            })
            deliveries++
            return Response.json(
              rejectEntry
                ? { FailedEntryCount: 1, Entries: [{ ErrorCode: "InternalFailure" }] }
                : { FailedEntryCount: 0, Entries: [{ EventId: "fixture-event" }] }
            )
          }
        }
      }
    }
  ]
})
try {
  const post = (header: string) =>
    runtime.dispatchFetch("https://copacker.test/api/webhooks/ebay", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ebay-signature": header },
      body
    })
  const invalid = await post("invalid")
  assert.equal(invalid.status, 412)
  assert.equal(deliveries, 0, "Unsigned notifications must never reach AWS")
  const forwarded = await post(signed)
  assert.equal(forwarded.status, 204, await forwarded.text())
  assert.equal(deliveries, 1)
  rejectEntry = true
  const refused = await post(signed)
  assert.equal(refused.status, 500, "An AWS entry failure must remain retryable by eBay")
  await refused.body?.cancel()
  assert.equal(deliveries, 2)
  rejectEntry = false
  const recovered = await post(signed)
  assert.equal(recovered.status, 204, await recovered.text())
  assert.equal(deliveries, 3)
  process.stdout.write(
    "Built Worker webhook checks passed: eBay signature, AWS signing/transport, rejection and recovery.\n"
  )
} finally {
  await runtime.dispose()
}
