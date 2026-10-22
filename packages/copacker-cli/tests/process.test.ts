import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const bin = fileURLToPath(new URL("../src/bin.ts", import.meta.url))
function execute(args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      windowsHide: true,
      env: { ...process.env, COPACKER_TOKEN: "", COPACKER_WORKSPACE: "" },
      stdio: ["ignore", "pipe", "pipe"]
    })
    const stdout: Buffer[] = [],
      stderr: Buffer[] = []
    child.stdout.on("data", (value: Buffer) => stdout.push(value))
    child.stderr.on("data", (value: Buffer) => stderr.push(value))
    child.on("error", reject)
    child.on("close", (code) =>
      resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") })
    )
  })
}

describe("executable process", () => {
  it("runs offline help, version and nested entity help on Node without a TypeScript loader", async () => {
    const version = await execute(["--version"])
    expect(version).toEqual({ code: 0, stdout: "0.0.0\n", stderr: "" })
    const help = await execute(["product", "price", "update", "--help"])
    expect(help.code).toBe(0)
    expect(help.stdout).toContain("--amount")
    expect(help.stdout).toContain("linked selling-price")
    expect(help.stderr).toBe("")
  })
  it("emits one machine-readable usage error with the documented exit code", async () => {
    const result = await execute(["order", "list", "--unknown", "--format=json"])
    expect(result.code).toBe(2)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout)).toHaveProperty("error.code", "invalid_input")
  })
})
