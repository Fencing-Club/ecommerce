import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import invariant from "tiny-invariant"
import { z } from "zod"
import { optionalSecrets, requiredSecrets, workerSettings } from "./cloudflare-environment"

const mode = z.enum(["staging", "production"]).parse(process.argv[2])
const action = z.enum(["check", "deploy"]).parse(process.argv[3] || "check")
const root = process.cwd()
const sha = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .parse(process.env.APP_COMMIT_SHA)
const secretFile = path.resolve(z.string().min(1).parse(process.env.CLOUDFLARE_SECRETS_FILE))
const settings = process.env.CLOUDFLARE_SETTINGS_FILE
  ? z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(process.env.CLOUDFLARE_SETTINGS_FILE, "utf8")))
  : {}
const allowedSettings = new Set<string>(workerSettings)
for (const name of Object.keys(settings)) {
  invariant(allowedSettings.has(name), `Unknown public Worker setting: ${name}`)
}
const secrets = z
  .record(z.string().regex(/^[A-Z][A-Z0-9_]+$/), z.string())
  .parse(JSON.parse(readFileSync(secretFile, "utf8")))
const allowedSecrets = new Set<string>([...requiredSecrets, ...optionalSecrets])
for (const name of Object.keys(secrets)) {
  invariant(allowedSecrets.has(name), `Unknown Worker secret: ${name}`)
}
for (const name of requiredSecrets) {
  invariant(secrets[name], `${name} is missing from the release secrets file`)
}
invariant(secrets.WORKOS_COOKIE_PASSWORD.length >= 32, "WORKOS_COOKIE_PASSWORD must be at least 32 characters")
invariant(
  Buffer.from(secrets.TOKEN_ENCRYPTION_KEY, "base64").length === 32,
  "TOKEN_ENCRYPTION_KEY must encode 32 bytes"
)
invariant(
  !("DATABASE_URL" in secrets) && !("DATABASE_CA_CERT" in secrets),
  "Database admin credentials must not be Worker secrets"
)
invariant(
  process.env.APP_URL && process.env.CLOUDFLARE_HYPERDRIVE_ID && process.env.CLOUDFLARE_DOCUMENTS_BUCKET,
  "Release requires its origin, Hyperdrive ID and R2 bucket"
)
if (action === "deploy") {
  invariant(
    process.env.RELEASE_CUTOVER_READY === "true",
    "Complete the release gates and set RELEASE_CUTOVER_READY in the protected GitHub environment"
  )
  invariant(process.env.DATABASE_URL, "Deploy requires the direct migration connection")
  invariant(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() === sha,
    "Release commit differs from the checkout"
  )
  invariant(
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" }).trim() === "",
    "Release requires a clean checkout so the served commit identifies the deployed source"
  )
}
// Only the Worker integrations enter the build process. Direct database/admin and account credentials stay out of
// Worker bindings. cf reads its own scoped API token from the parent environment when deploying.
const environment = { ...process.env, ...settings, ...secrets }
const vite = fileURLToPath(new URL("./bin/vite.js", import.meta.resolve("vite/package.json")))
const storybook = fileURLToPath(new URL("./dist/bin/dispatcher.js", import.meta.resolve("storybook/package.json")))
const cf = fileURLToPath(new URL("./bin/cf", import.meta.resolve("cf/package.json")))
function run(args: string[], cwd = root) {
  execFileSync(process.execPath, args, { cwd, env: environment, stdio: "inherit" })
}
run([vite, "build", "--mode", mode])
run([storybook, "build"])
run(["--import", "tsx", "scripts/build-stories-release.ts", mode])
const deploy = [
  cf,
  "deploy",
  "--prebuilt",
  "--mode",
  mode,
  "--provision=false",
  "--tag",
  sha.slice(0, 12),
  "--message",
  sha
]
run([...deploy, "--dry-run", "--secrets-file", secretFile])
const stories = path.join(root, ".cloudflare/stories-release")
run([...deploy, "--dry-run"], stories)
if (action === "deploy") {
  run(["--import", "tsx", "scripts/migrate.ts"])
  run([...deploy, "--secrets-file", secretFile])
  run(deploy, stories)
  process.stdout.write(`Released ${sha}; verify the web and Storybook health endpoints before promoting.\n`)
}
