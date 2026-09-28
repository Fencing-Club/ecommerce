import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import path from "node:path"
import { e2eUser } from "../scripts/e2e-user"

// Each run signs in afresh into its own folder, and clears out folders an earlier run left behind. The test account must
// exist with its derived password before the first sign-in; a run without WORKOS_API_KEY (production's signed-out
// smoke specs) never signs in.
export default async function globalSetup() {
  const root = path.join(import.meta.dirname, ".auth")
  mkdirSync(root, { recursive: true })
  for (const entry of readdirSync(root)) {
    const stale = path.join(root, entry)
    if (Date.now() - statSync(stale).mtimeMs > 3 * 60 * 60 * 1000) {
      rmSync(stale, { recursive: true, force: true })
    }
  }
  process.env.E2E_AUTH_DIR = path.join(root, `run-${process.pid}-${Date.now()}`)
  if (process.env.WORKOS_API_KEY) {
    await e2eUser()
  }
}
