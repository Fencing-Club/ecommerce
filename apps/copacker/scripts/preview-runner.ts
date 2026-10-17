// Trusted PRs get staging data; closed PRs lose every preview resource, including partial deployments.
import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { hostedPreviewNumbers, hostingSettings, previewInventory, removeHostedPreview } from "./preview-cloudflare"
import { assertPreviewBranch, neonBranch, previewSettings } from "./preview-config"
import { deployHostedPreview } from "./preview-hosting"
import { PreviewTimings } from "./preview-timings"

export async function runPreview(mode: "deploy" | "remove" | "discover") {
  const timings = new PreviewTimings()
  try {
    return await timings.measure("total", () => executePreview(mode, timings))
  } finally {
    timings.finish()
  }
}

async function executePreview(mode: "deploy" | "remove" | "discover", timings: PreviewTimings) {
  const settings = previewSettings.parse({ ...process.env, ...(mode === "discover" ? { PR_NUMBER: "1" } : {}) })
  const name = `pr-${settings.PR_NUMBER}`
  const key = z.string().trim().min(1).parse(process.env.NEON_API_KEY)
  const hosting = process.env.CLOUDFLARE_PREVIEW_CONFIG
    ? hostingSettings.parse(JSON.parse(process.env.CLOUDFLARE_PREVIEW_CONFIG))
    : undefined

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
    return response.status === 204 ? undefined : response.json()
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

  async function pullRequest(number: string) {
    const repository = z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/)
      .parse(process.env.GITHUB_REPOSITORY)
    const token = z.string().min(1).parse(process.env.GH_TOKEN)
    const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${number}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30000)
    })
    // A missing PR can also mean lost access; delete only when GitHub explicitly reports it closed.
    if (!response.ok) {
      throw new Error(`GitHub PR lookup failed (${response.status})`)
    }
    return z
      .object({ state: z.enum(["open", "closed"]), head: z.object({ sha: z.string() }).optional() })
      .parse(await response.json())
  }

  async function remove(number: string, branch?: z.infer<typeof neonBranch>) {
    if (branch) {
      assertPreviewBranch(branch, `pr-${number}`, settings.NEON_STAGING_BRANCH_ID)
    }
    if (hosting) {
      removeHostedPreview(hosting, number)
    }
    // Keep the database until hosting/files are confirmed gone. Every retry inventories providers again.
    if (branch) {
      await neon(`/branches/${branch.id}`, "DELETE")
      if ((await branches(`pr-${number}`)).some((entry) => entry.id === branch.id)) {
        throw new Error("Neon preview branch still exists after cleanup")
      }
    }
    log(`Removed pr-${number}`)
  }

  if (mode === "discover") {
    const found = (await branches("pr-")).filter(
      (branch) => /^pr-[1-9]\d*$/.test(branch.name) && branch.parent_id === settings.NEON_STAGING_BRANCH_ID
    )
    const numbers = hosting ? hostedPreviewNumbers(previewInventory(hosting)) : new Set<string>()
    for (const branch of found) {
      numbers.add(branch.name.slice(3))
    }
    const failed: string[] = []
    const closed: string[] = []
    for (const number of numbers) {
      try {
        if ((await pullRequest(number)).state === "closed") {
          closed.push(number)
        }
      } catch {
        failed.push(number)
      }
    }
    // Discovery never deletes. Each matrix job rechecks GitHub and providers after acquiring its PR's lock.
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `numbers=${JSON.stringify(closed)}\n`)
    }
    log(`Found ${closed.length} closed previews for cleanup`)
    if (failed.length) {
      throw new Error(`Preview discovery incomplete for PRs ${failed.join(", ")}; rerun cleanup`)
    }
  } else {
    let branch = (await branches(name)).find((entry) => entry.name === name)
    if (branch) {
      assertPreviewBranch(branch, name, settings.NEON_STAGING_BRANCH_ID)
    }
    if (mode === "remove") {
      if ((await pullRequest(settings.PR_NUMBER)).state !== "closed") {
        log(`Preserved ${name}: PR is open or has reopened`)
        return
      }
      await remove(settings.PR_NUMBER, branch)
    } else {
      if (hosting) {
        const pr = await pullRequest(settings.PR_NUMBER)
        if (pr.state === "closed") {
          await remove(settings.PR_NUMBER, branch)
          return
        }
        if (pr.head?.sha !== process.env.APP_COMMIT_SHA) {
          log("Skipped outdated preview deployment")
          return
        }
        // An expired database must not be paired with old PR files or a live app pointed at its old endpoint.
        if (!branch) {
          await timings.measure("preflight", () => removeHostedPreview(hosting, settings.PR_NUMBER))
        }
      }
      const { url, expiresAt, readyBranch } = await timings.measure("database", async () => {
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
        return { url, expiresAt, readyBranch: branch }
      })
      branch = readyBranch
      const urls = hosting ? await deployHostedPreview(hosting, settings.PR_NUMBER, url, timings) : undefined
      if (hosting && (await timings.measure("postflight", () => pullRequest(settings.PR_NUMBER))).state === "closed") {
        await remove(settings.PR_NUMBER, branch)
        return
      }
      if (process.env.GITHUB_OUTPUT) {
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          `branch_id=${branch.id}\n${urls ? `url=${urls.app}\nstories_url=${urls.stories}\n` : ""}`
        )
      }
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `Neon database branch: ${name} (${branch.id})\n\nCopied from staging, with this PR's migrations applied. Expires ${expiresAt}.\n\n${urls ? `[App preview](${urls.app}) | [Storybook](${urls.stories})\n\nPreview availability does not imply CI passed; verification continues independently and is required before merge. Preview resources are removed on merge/close, with a six-hour cleanup sweep. Background jobs stay isolated and pending until preview job execution is migrated.` : "Cloudflare previews require the repository's CLOUDFLARE_PREVIEW_CONFIG and preview credentials."}\n`
        )
      }
    }
  }
}
