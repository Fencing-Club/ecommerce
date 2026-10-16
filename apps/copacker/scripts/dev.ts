import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { getEndpoint } from "@buildkitgg/dev-domains/node"
import { z } from "zod"
import { localAppEnvironment } from "./dev-environment"
import { localStorage } from "./local-storage"

// These commands need the app's address but do not own a network listener.
const service = z.enum(["worker", "build-e2e"]).parse(process.argv[2])
if (existsSync(".env")) {
  process.loadEnvFile(".env")
}
const endpoint = await getEndpoint(service === "worker" ? "app" : "e2e")
Object.assign(process.env, localAppEnvironment(endpoint.origin))
if (service === "build-e2e") {
  process.env.COPACKER_E2E_BUILD = "1"
}
if (service === "worker") {
  const storage = localStorage()
  Object.assign(process.env, {
    S3_ENDPOINT: endpoint.origin + "/cdn-cgi/local/r2/s3",
    S3_BUCKET: storage.bucket,
    S3_ACCESS_KEY_ID: storage.credentials.accessKeyId,
    S3_SECRET_ACCESS_KEY: storage.credentials.secretAccessKey
  })
}
const args =
  service === "worker"
    ? ["--use-system-ca", "--import", "tsx", "src/server/worker.ts"]
    : [fileURLToPath(new URL("./bin/vite.js", import.meta.resolve("vite/package.json"))), "build", "--mode", "e2e"]
const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env })
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal))
}
child.on("error", (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on("exit", (code) => {
  process.exitCode = code ?? 1
})
