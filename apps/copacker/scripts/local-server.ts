import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { developmentEnvironment, localAppEnvironment } from "./dev-environment"

const service = z.enum(["app", "stories", "e2e"]).parse(process.argv[2])
const environment = developmentEnvironment()
const url = environment[service]
const port = z.coerce.number().int().min(1024).max(65535).parse(process.env.PORT)
if (process.env.PORTLESS_URL !== url) {
  throw new Error(`Expected Portless origin ${url}; run pnpm dev:setup first`)
}
if (existsSync(".env")) {
  process.loadEnvFile(".env")
}
Object.assign(process.env, localAppEnvironment(url))
if (service === "e2e") {
  process.env.COPACKER_E2E_BUILD = "1"
}
const args =
  service === "stories"
    ? [
        fileURLToPath(new URL("./dist/bin/dispatcher.js", import.meta.resolve("storybook/package.json"))),
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--exact-port",
        "--no-open",
        "--ci"
      ]
    : [
        fileURLToPath(import.meta.resolve("next/dist/bin/next")),
        service === "e2e" && !process.env.E2E_DEV ? "start" : "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port)
      ]
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
