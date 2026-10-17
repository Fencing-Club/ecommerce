import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { stripVTControlCharacters } from "node:util"

type Phase =
  | "total"
  | "preflight"
  | "database"
  | "resources"
  | "documents"
  | "app-build"
  | "worker-regression"
  | "storybook-artifact"
  | "app-validate"
  | "app-deploy"
  | "resource-tags"
  | "storybook-publish"
  | "app-health"
  | "storybook-health"
  | "postflight"
type Measurement = { phase: Phase; status: "passed" | "failed"; durationMs: number }
type Counts = {
  documentFiles?: number
  documentBytes?: number
  documentsReused?: number
  storybookFiles?: number
  storybookBytes?: number
  appBuildCacheHits?: number
}

// Only fixed phase names and aggregate counts are recorded. Provider output and copied keys stay private.
export class PreviewTimings {
  private readonly measurements: Measurement[] = []
  private readonly counts: Counts = {}

  async measure<T>(phase: Phase, action: () => T | Promise<T>): Promise<T> {
    const start = performance.now()
    let status: Measurement["status"] = "failed"
    process.stdout.write(`${JSON.stringify({ event: "preview-phase", phase, status: "started" })}\n`)
    try {
      const value = await action()
      status = "passed"
      return value
    } finally {
      const measurement = { phase, status, durationMs: Math.round(performance.now() - start) }
      this.measurements.push(measurement)
      process.stdout.write(`${JSON.stringify({ event: "preview-phase", ...measurement })}\n`)
    }
  }

  count(values: Counts) {
    Object.assign(this.counts, values)
  }

  buildCache(output: string) {
    // Never replay build output: allow only the task's cache state and opaque hash into hosted logs.
    const text = stripVTControlCharacters(output)
    const match = /^copacker:build:preview: cache (hit|miss), [^\r\n]* ([a-f0-9]{16})\s*$/m.exec(text)
    const remote = /Remote caching (enabled|disabled)/.exec(text)?.[1] ?? "unknown"
    if (match) {
      this.count({ appBuildCacheHits: match[1] === "hit" ? 1 : 0 })
    }
    process.stdout.write(
      `${JSON.stringify({ event: "preview-build-cache", status: match?.[1] ?? "unknown", hash: match?.[2], remote })}\n`
    )
  }

  finish() {
    const report = { measurements: this.measurements, counts: this.counts }
    if (process.env.PREVIEW_TIMINGS_FILE) {
      const file = path.resolve(process.env.PREVIEW_TIMINGS_FILE)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(report, null, 2))
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `\n### Preview timings\n\n| Phase | Seconds | Result |\n| --- | ---: | --- |\n${this.measurements.map((item) => `| ${item.phase} | ${(item.durationMs / 1000).toFixed(1)} | ${item.status} |`).join("\n")}\n\nCounts: \`${JSON.stringify(this.counts)}\`. Total includes the phases above; it excludes the CI queue, earlier verification and runner setup.\n`
      )
    }
    return report
  }
}
