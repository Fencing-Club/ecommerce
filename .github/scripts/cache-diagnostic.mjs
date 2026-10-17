import { spawn } from "node:child_process"
import { createHmac } from "node:crypto"
import { mkdtemp, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import path from "node:path"

const fixture = await mkdtemp(path.join(process.env.RUNNER_TEMP, "cache-probe-"))
await writeFile(
  path.join(fixture, "package.json"),
  JSON.stringify({
    name: "cache-probe",
    packageManager: "pnpm@12.10.1",
    scripts: { build: "node build.mjs" }
  })
)
await writeFile(
  path.join(fixture, "build.mjs"),
  'import{mkdirSync,writeFileSync}from"node:fs";import{randomBytes}from"node:crypto";mkdirSync("dist",{recursive:true});writeFileSync("dist/probe",randomBytes(13*1024*1024));'
)
await writeFile(
  path.join(fixture, "turbo.json"),
  JSON.stringify({ remoteCache: { signature: true }, tasks: { build: { outputs: ["dist/**"] } } })
)
const api = process.env.TURBO_API
function valid(hash, body, tag) {
  const mac = createHmac("sha256", process.env.TURBO_REMOTE_CACHE_SIGNATURE_KEY)
  for (const field of ["artifact-signature:v2", hash, "", body]) {
    const bytes = Buffer.from(field)
    const length = Buffer.alloc(8)
    length.writeBigUInt64LE(BigInt(bytes.length))
    mac.update(length).update(bytes)
  }
  return mac.digest("base64") === tag
}
const proxy = createServer(async (req, res) => {
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    const url = new URL(req.url, api)
    const headers = new Headers()
    for (const name of ["authorization", "content-type", "x-artifact-tag", "x-artifact-duration"]) {
      if (req.headers[name]) headers.set(name, req.headers[name])
    }
    const hash = url.pathname.split("/").at(-1)
    if (req.method === "PUT") {
      console.log(
        JSON.stringify({
          direction: "upload",
          bytes: body.length,
          signatureValid: valid(hash, body, headers.get("x-artifact-tag")),
          teamId: url.searchParams.get("teamId"),
          slug: url.searchParams.get("slug")
        })
      )
    }
    const response = await fetch(url, {
      method: req.method,
      headers,
      ...(body.length ? { body } : {}),
      signal: AbortSignal.timeout(30000)
    })
    const bytes = Buffer.from(await response.arrayBuffer())
    if (req.method === "GET" && response.headers.has("x-artifact-tag")) {
      console.log(
        JSON.stringify({
          direction: "download",
          bytes: bytes.length,
          signatureValid: valid(hash, bytes, response.headers.get("x-artifact-tag"))
        })
      )
    }
    res.writeHead(
      response.status,
      Object.fromEntries(
        [...response.headers].filter(
          ([name]) => !["content-encoding", "transfer-encoding", "connection"].includes(name)
        )
      )
    )
    res.end(bytes)
  } catch {
    console.log("Cache probe transport failed")
    res.writeHead(502).end()
  }
})
await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve))
try {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const child = spawn(
      process.execPath,
      [path.resolve("node_modules/turbo/bin/turbo"), "run", "build", "--cache=remote:rw", "--output-logs=hash-only"],
      { cwd: fixture, env: { ...process.env, TURBO_API: `http://127.0.0.1:${proxy.address().port}` } }
    )
    let output = ""
    child.stdout.on("data", (chunk) => (output += chunk))
    child.stderr.on("data", (chunk) => (output += chunk))
    const code = await new Promise((resolve) => child.on("close", resolve))
    console.log(
      JSON.stringify({
        attempt,
        code,
        hit: /cache hit/.test(output),
        invalidTag: /(?:invalid.*tag|tag.*invalid)/i.test(output),
        errors: output
          .split("\n")
          .filter((line) => /WARN|ERROR|error|signature|tag|lockfile|package manager/i.test(line))
          .map((line) =>
            line
              .replaceAll(process.env.TURBO_REMOTE_CACHE_SIGNATURE_KEY, "[redacted]")
              .replaceAll(process.env.TURBO_TOKEN, "[redacted]")
          )
      })
    )
  }
} finally {
  proxy.close()
}
