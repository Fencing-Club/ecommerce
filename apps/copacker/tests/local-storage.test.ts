import { mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Miniflare } from "miniflare"
import { expect, it } from "vitest"

it("shares private files between native R2 and the retained Node S3 client", async () => {
  const root = path.resolve(".cloudflare")
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(path.join(root, "storage-rehearsal-"))
  if (!directory.startsWith(`${root}${path.sep}`)) {
    throw new Error("Unexpected storage rehearsal directory")
  }
  const credentials = {
    accessKeyId: "local-test-access-key",
    secretAccessKey: "local-test-secret-key-only-for-emulation"
  }
  const runtime = new Miniflare({
    host: "127.0.0.1",
    port: 0,
    telemetry: { enabled: false },
    resourcePersistencePath: directory,
    workers: [
      {
        config: {
          name: "copacker-storage-test",
          compatibilityDate: "2026-10-15",
          manifest: {
            mainModule: "index.js",
            modules: {
              "index.js": {
                type: "esm",
                contents: `export default {
                  async fetch(request, env) {
                    const key = new URL(request.url).pathname.slice(1)
                    if (request.method === 'PUT') {
                      await env.DOCUMENTS.put(key, request.body, {
                        httpMetadata: { contentType: request.headers.get('content-type') }
                      })
                      return new Response(null, { status: 204 })
                    }
                    const object = await env.DOCUMENTS.get(key)
                    return object ? new Response(object.body) : new Response(null, { status: 404 })
                  }
                }`
              }
            }
          },
          env: { DOCUMENTS: { type: "r2", name: "local-rehearsal", dev: { experimentalS3Credentials: credentials } } }
        }
      }
    ]
  })
  let client: S3Client | undefined
  try {
    const endpoint = new URL("/cdn-cgi/local/r2/s3", await runtime.ready).href
    client = new S3Client({ endpoint, region: "auto", forcePathStyle: true, credentials })
    const object = { Bucket: "local-rehearsal", Key: "private/file" }
    const url = `http://local/${object.Key}`
    const uploaded = await runtime.dispatchFetch(url, {
      method: "PUT",
      body: "original",
      headers: { "content-type": "application/pdf" }
    })
    expect(uploaded.status).toBe(204)
    const fromWorker = await client.send(new GetObjectCommand(object))
    expect(await fromWorker.Body?.transformToString()).toBe("original")
    expect(fromWorker.ContentType).toBe("application/pdf")
    await client.send(new PutObjectCommand({ ...object, Body: "processed", ContentType: "text/plain" }))
    expect(await (await runtime.dispatchFetch(url)).text()).toBe("processed")
    await client.send(new DeleteObjectCommand(object))
    expect((await runtime.dispatchFetch(url)).status).toBe(404)
  } finally {
    client?.destroy()
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
