// Trusted PRs get a staging database copy. App previews will move to Cloudflare with the web runtime.
import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { assertPreviewBranch, neonBranch, previewSettings } from "./preview-config"

export async function runPreview(mode: "deploy" | "remove" | "sweep") {
  const settings = previewSettings.parse({ ...process.env, ...(mode === "sweep" ? { PR_NUMBER: "1" } : {}) })
  const name = `pr-${settings.PR_NUMBER}`
  const key = z.string().trim().min(1).parse(process.env.NEON_API_KEY)

  function log(message: string) {
    process.stdout.write(`${message}\n`)
  }

  async function neon(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`https://console.neon.tech/api/v2/projects/${settings.NEON_PROJECT_ID}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60000)
    })
    if (!response.ok) {
      throw new Error(`Neon ${method} failed (${response.status})`)
    }
    return response.json()
  }

  async function branches(search: string) {
    const found: z.infer<typeof neonBranch>[] = []
    let cursor: string | undefined
    do {
      const query = new URLSearchParams({ search, limit: "100", ...(cursor ? { cursor } : {}) })
      const result = z
        .object({
          branches: z.array(neonBranch),
          pagination: z.object({ next: z.string().nullable().optional() }).optional()
        })
        .parse(await neon(`/branches?${query}`))
      found.push(...result.branches)
      cursor = result.pagination?.next ?? undefined
    } while (cursor)
    return found
  }

  if (mode === "sweep") {
    const repository = z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/)
      .parse(process.env.GITHUB_REPOSITORY)
    const token = z.string().min(1).parse(process.env.GH_TOKEN)
    for (const branch of await branches("pr-")) {
      if (!/^pr-[1-9]\d*$/.test(branch.name) || branch.parent_id !== settings.NEON_STAGING_BRANCH_ID) {
        continue
      }
      assertPreviewBranch(branch, branch.name, settings.NEON_STAGING_BRANCH_ID)
      const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${branch.name.slice(3)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(30000)
      })
      // A missing PR can also mean lost access; delete only when GitHub explicitly reports it closed.
      if (!response.ok) {
        throw new Error(`GitHub PR lookup failed (${response.status})`)
      }
      if (z.object({ state: z.enum(["open", "closed"]) }).parse(await response.json()).state === "closed") {
        await neon(`/branches/${branch.id}`, "DELETE")
        log(`Removed ${branch.name}`)
      }
    }
  } else {
    let branch = (await branches(name)).find((entry) => entry.name === name)
    if (branch) {
      assertPreviewBranch(branch, name, settings.NEON_STAGING_BRANCH_ID)
    }
    if (mode === "remove") {
      if (branch) {
        await neon(`/branches/${branch.id}`, "DELETE")
      }
      log(`Removed ${name}`)
    } else {
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z")
      if (!branch) {
        branch = z.object({ branch: neonBranch }).parse(
          await neon("/branches", "POST", {
            branch: { name, parent_id: settings.NEON_STAGING_BRANCH_ID, expires_at: expiresAt },
            endpoints: [{ type: "read_write", autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 1 }]
          })
        ).branch
        assertPreviewBranch(branch, name, settings.NEON_STAGING_BRANCH_ID)
      } else {
        await neon(`/branches/${branch.id}`, "PATCH", { branch: { expires_at: expiresAt } })
      }
      const params = new URLSearchParams({
        branch_id: branch.id,
        database_name: settings.NEON_DATABASE_NAME,
        role_name: settings.NEON_ROLE_NAME,
        pooled: "false"
      })
      const result = z.object({ uri: z.string() }).parse(await neon(`/connection_uri?${params}`))
      const url = new URL(result.uri)
      url.searchParams.set("sslmode", "verify-full")
      try {
        execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], {
          cwd: fileURLToPath(new URL("..", import.meta.url)),
          env: { ...process.env, DATABASE_URL: url.toString(), DIRECT_DATABASE_URL: url.toString() },
          stdio: "pipe",
          timeout: 300000
        })
      } catch {
        // Migration errors can include copied data. Keep connection strings and database contents out of CI logs.
        throw new Error(`Migrations failed on Neon branch ${branch.id}; inspect this isolated PR database`)
      }
      log(`Neon branch ${name} (${branch.id}) is ready; migrations applied; expires ${expiresAt}`)
      if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `branch_id=${branch.id}\n`)
      }
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `Neon database branch: ${name} (${branch.id})\n\nCopied from staging, with this PR's migrations applied. Expires ${expiresAt}.\n\nHosted app previews are deferred until the Cloudflare web migration. No app, worker, or storage resources are provisioned.\n`
        )
      }
    }
  }
}
