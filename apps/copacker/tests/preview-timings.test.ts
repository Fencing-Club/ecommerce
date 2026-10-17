import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PreviewTimings } from "../scripts/preview-timings"

let directory: string
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "copacker-timing-test-"))
  vi.stubEnv("PREVIEW_TIMINGS_FILE", path.join(directory, "timings.json"))
  vi.stubEnv("GITHUB_STEP_SUMMARY", path.join(directory, "summary.md"))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  if (
    path.dirname(directory) !== path.resolve(tmpdir()) ||
    !path.basename(directory).startsWith("copacker-timing-test-")
  ) {
    throw new Error("Unsafe timing test directory")
  }
  rmSync(directory, { recursive: true, force: true })
})

it("reports elapsed phases and aggregate counts without including returned data", async () => {
  vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(1425)
  const timings = new PreviewTimings()
  expect(await timings.measure("documents", () => "private document contents")).toBe("private document contents")
  timings.count({ documentFiles: 2, documentBytes: 100 })
  expect(timings.finish()).toEqual({
    measurements: [{ phase: "documents", status: "passed", durationMs: 1325 }],
    counts: { documentFiles: 2, documentBytes: 100 }
  })
  expect(readFileSync(path.join(directory, "summary.md"), "utf8")).toContain("| documents | 1.3 | passed |")
  expect(readFileSync(path.join(directory, "timings.json"), "utf8")).not.toContain("private")
})

it("records failed phases without leaking provider errors, and preserves the failure", async () => {
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true)
  const timings = new PreviewTimings()
  const failure = new Error("private provider token")
  await expect(timings.measure("app-deploy", () => Promise.reject(failure))).rejects.toBe(failure)
  expect(timings.finish().measurements[0]).toMatchObject({ phase: "app-deploy", status: "failed" })
  expect(output.mock.calls.flat().join("")).not.toContain("private")
  expect(readFileSync(path.join(directory, "timings.json"), "utf8")).not.toContain("private")
})
