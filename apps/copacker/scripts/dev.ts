import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { RouteStore, resolveUserHome } from "portless"
import { developmentEnvironment, developmentProxyDomain, localAppEnvironment } from "./dev-environment"
import { localStorage } from "./local-storage"

const service = process.argv[2]
const environment = developmentEnvironment()
const portless = fileURLToPath(new URL("./cli.js", import.meta.resolve("portless")))
process.env.PORTLESS_TLD = developmentProxyDomain
process.env.PORTLESS_HTTPS = "1"
process.env.PORTLESS_PORT = "443"
process.env.PORTLESS_LAN = "0"
// The public DNS-only wildcard resolves to loopback; avoid privileged per-route hosts edits.
process.env.PORTLESS_SYNC_HOSTS = "0"
// Git for Windows already ships OpenSSL, but usually exposes only git.exe on PATH.
if (process.platform === "win32" && spawnSync("openssl", ["version"]).error) {
  const gitBin = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "usr", "bin")
  if (existsSync(path.join(gitBin, "openssl.exe"))) {
    process.env.PATH = `${gitBin}${path.delimiter}${process.env.PATH ?? ""}`
  }
}

function run(args: string[]) {
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
}

if (service === "urls") {
  process.stdout.write(`${JSON.stringify(environment, null, 2)}\n`)
} else if (service === "setup") {
  run([portless, "proxy", "start", "--tld", developmentProxyDomain])
} else if (service === "status") {
  process.stdout.write(`${JSON.stringify(environment, null, 2)}\n`)
  run([portless, "list"])
} else if (service === "app" || service === "stories" || service === "e2e") {
  const url = environment[service]
  const hostname = new URL(url).hostname
  const store = new RouteStore(process.env.PORTLESS_STATE_DIR || path.join(resolveUserHome(), ".portless"))
  const conflict = store.loadRoutes().find((route) => route.hostname === hostname)
  if (conflict) {
    throw new Error(
      `Domain ${hostname} is already in use on port ${conflict.port}. Reuse that server or rename this worktree. The existing server was left running.`
    )
  }
  const name = hostname.slice(0, -(developmentProxyDomain.length + 1))
  process.stdout.write(`${service}: ${url}\nCheckout: ${environment.root}\n`)
  // Include local in the explicit name so the primary app can use local.copacker.ai.
  run([portless, "--name", name, process.execPath, "--import", "tsx", "scripts/local-server.ts", service])
} else if (service === "worker" || service === "build-e2e") {
  if (existsSync(".env")) {
    process.loadEnvFile(".env")
  }
  Object.assign(process.env, localAppEnvironment(service === "worker" ? environment.app : environment.e2e))
  if (service === "worker") {
    const storage = localStorage()
    Object.assign(process.env, {
      S3_ENDPOINT: `${environment.app}/cdn-cgi/local/r2/s3`,
      S3_BUCKET: storage.bucket,
      S3_ACCESS_KEY_ID: storage.credentials.accessKeyId,
      S3_SECRET_ACCESS_KEY: storage.credentials.secretAccessKey
    })
    run(["--use-system-ca", "--import", "tsx", "src/server/worker.ts"])
  } else {
    process.env.COPACKER_E2E_BUILD = "1"
    run([fileURLToPath(new URL("./bin/vite.js", import.meta.resolve("vite/package.json"))), "build", "--mode", "e2e"])
  }
} else {
  throw new Error("Expected app, stories, e2e, worker, build-e2e, setup, urls or status")
}
