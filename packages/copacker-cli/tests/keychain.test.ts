import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { profileToken } from "../src/auth.ts"
import { LocalStore } from "../src/storage.ts"

const keychain = vi.hoisted(() => new Map<string, string>())
vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events")
  const { PassThrough, Writable } = await import("node:stream")
  return {
    spawn: (program: string, args: string[]) => {
      const child = new EventEmitter()
      const stdout = new PassThrough(),
        stderr = new PassThrough()
      let input = ""
      const stdin = new Writable({
        write(chunk, _encoding, done) {
          input += chunk.toString()
          done()
        },
        final(done) {
          queueMicrotask(() => {
            const after = (flag: string) => args[args.indexOf(flag) + 1]
            let service = after(program === "secret-tool" ? "service" : "-s")
            let account = after(program === "secret-tool" ? "profile" : "-a")
            let action = args[0]
            if (action === "-i") {
              const match = /^add-generic-password -U -s (\S+) -a (\S+) -w "(.*)"\n$/.exec(input)
              if (!match) {
                throw new Error("Unexpected keychain command")
              }
              service = match[1]
              account = match[2]
              input = JSON.parse(`"${match[3]}"`)
              action = "store"
            }
            const key = `${service}:${account}`
            if (action === "store") {
              keychain.set(key, input)
            } else if (action === "clear" || action === "delete-generic-password") {
              keychain.delete(key)
            } else {
              stdout.write(keychain.get(key) ?? "")
            }
            child.emit("close", 0)
          })
          done()
        }
      })
      return Object.assign(child, { stdout, stderr, stdin, kill: () => undefined })
    }
  }
})
const roots: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  keychain.clear()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
it.each(["linux", "darwin"])(
  "isolates %s keychains by config directory and rejects changed credential origins",
  async (platform) => {
    vi.stubGlobal("process", { ...process, platform })
    const root = await mkdtemp(join(tmpdir(), "copacker-keychain-"))
    roots.push(root)
    const first = new LocalStore(join(root, "one")),
      second = new LocalStore(join(root, "two"))
    keychain.set("copacker:default", JSON.stringify({ kind: "automation", accessToken: "old-global-secret" }))
    expect(await first.credential("default")).toBeUndefined()
    await first.replaceCredential(
      "default",
      { baseUrl: "https://one.example" },
      { kind: "automation", accessToken: "one" }
    )
    await second.replaceCredential(
      "default",
      { baseUrl: "https://two.example" },
      { kind: "automation", accessToken: "two" }
    )
    expect((await first.credential("default"))?.accessToken).toBe("one")
    expect((await second.credential("default"))?.accessToken).toBe("two")
    const alias = new LocalStore(join(root, "one", "..", "one"))
    expect((await alias.credential("default"))?.accessToken).toBe("one")
    await first.clearCredential("default")
    expect(await first.credential("default")).toBeUndefined()
    expect((await second.credential("default"))?.accessToken).toBe("two")
    await second.saveProfile("default", { baseUrl: "https://untrusted.example" })
    const fetch = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal("fetch", fetch)
    await expect(profileToken(second, "default", "https://untrusted.example")).rejects.toThrow(
      "stored credential does not match"
    )
    expect(fetch).not.toHaveBeenCalled()
  }
)
