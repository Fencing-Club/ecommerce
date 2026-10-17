import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { sealStorybookArtifact, verifyStorybookArtifact } from "../scripts/storybook-artifact"

let root: string
let directory: string
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "copacker-artifact-test-"))
  directory = path.join(root, "storybook-static")
  mkdirSync(directory)
  writeFileSync(path.join(directory, "index.html"), "manager")
  writeFileSync(path.join(directory, "iframe.html"), "stories")
})
afterEach(() => {
  if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith("copacker-artifact-test-")) {
    throw new Error("Unsafe temporary directory")
  }
  rmSync(root, { recursive: true, force: true })
})
it("accepts the exact build and refuses stale commit metadata", () => {
  sealStorybookArtifact(directory, "a".repeat(40))
  expect(() => verifyStorybookArtifact(directory, "a".repeat(40))).not.toThrow()
  expect(() => verifyStorybookArtifact(directory, "b".repeat(40))).toThrow("does not match")
})
it.each(["changed", "missing", "extra"])("rejects %s artifact content even when the commit matches", (mutation) => {
  sealStorybookArtifact(directory, "a".repeat(40))
  if (mutation === "missing") {
    rmSync(path.join(directory, "iframe.html"))
  } else {
    writeFileSync(path.join(directory, mutation === "extra" ? "extra.js" : "iframe.html"), "changed")
  }
  expect(() => verifyStorybookArtifact(directory, "a".repeat(40))).toThrow("does not match")
})
