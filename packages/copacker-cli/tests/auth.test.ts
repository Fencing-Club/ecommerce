import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { login, logout, profileToken } from "../src/auth.ts"
import { LocalStore, secretFile, type LoginSecret } from "../src/storage.ts"

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
class MemoryStore extends LocalStore {
  secret?: LoginSecret
  override async saveCredential(_name: string, value: LoginSecret) {
    this.secret = value
  }
  override async credential(_name: string) {
    return this.secret
  }
  override async clearCredential(_name: string) {
    this.secret = undefined
  }
}

describe("interactive credentials", () => {
  it("leaves no old secret bound to a new origin when protected replacement fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "copacker-auth-origin-"))
    directories.push(root)
    const store = new MemoryStore(root)
    await store.replaceCredential(
      "test",
      { baseUrl: "https://old.example" },
      { kind: "interactive", accessToken: "old-secret" }
    )
    const save = vi.spyOn(store, "saveCredential").mockRejectedValueOnce(new Error("Protected storage failed"))
    await expect(
      store.replaceCredential(
        "test",
        { baseUrl: "https://new.example" },
        { kind: "interactive", accessToken: "new-secret" }
      )
    ).rejects.toThrow("Protected storage failed")
    expect(await store.credential("test")).toBeUndefined()
    save.mockRestore()
    await store.replaceCredential(
      "test",
      { baseUrl: "https://new.example" },
      { kind: "interactive", accessToken: "new-secret" }
    )
    expect(await profileToken(store, "test", "https://new.example")).toBe("new-secret")
  })
  it("binds login to PKCE and loopback state, rotates refresh tokens and clears failed revocations", async () => {
    const root = await mkdtemp(join(tmpdir(), "copacker-auth-test-"))
    directories.push(root)
    const store = new MemoryStore(root)
    let challenge = ""
    const grants: string[] = []
    const inputs: URLSearchParams[] = []
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const input = new URLSearchParams(Buffer.concat(chunks).toString("utf8"))
      if (request.url === "/api/cli/revoke") {
        response.writeHead(503).end()
        return
      }
      const grant = input.get("grant_type") ?? ""
      grants.push(grant)
      inputs.push(input)
      response.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          access_token: grant === "authorization_code" ? "access-one" : "access-two",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: grant === "authorization_code" ? "refresh-one" : "refresh-two"
        })
      )
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Missing listener")
    }
    const origin = `http://127.0.0.1:${address.port}`
    let callback: Promise<void> = Promise.resolve()
    try {
      await login(
        store,
        "test",
        origin,
        (message) => {
          const authorization = new URL(message.slice(message.indexOf("http")))
          challenge = authorization.searchParams.get("code_challenge") ?? ""
          callback = (async () => {
            const target = new URL(authorization.searchParams.get("redirect_uri")!)
            target.search = new URLSearchParams({ state: "wrong-state", code: "wrong-code" }).toString()
            const rejected = await fetch(target)
            expect(rejected.status).toBe(400)
            await rejected.text()
            target.search = new URLSearchParams({
              state: authorization.searchParams.get("state")!,
              code: "single-use-code"
            }).toString()
            const accepted = await fetch(target)
            expect(accepted.status).toBe(200)
            await accepted.text()
          })()
        },
        false
      )
      await callback
      expect(store.secret?.accessToken).toBe("access-one")
      if (!store.secret) {
        throw new Error("Missing saved credential")
      }
      store.secret.expiresAt = 0
      expect(await Promise.all([profileToken(store, "test", origin), profileToken(store, "test", origin)])).toEqual([
        "access-two",
        "access-two"
      ])
      expect(store.secret.refreshToken).toBe("refresh-two")
      await expect(profileToken(store, "test", "https://another.example")).rejects.toThrow(
        "This profile's API origin changed"
      )
      await expect(logout(store, "test", "https://another.example")).rejects.toThrow(
        "This profile's API origin changed"
      )
      expect(await logout(store, "test", origin)).toEqual({ cleared: true, revoked: false })
      expect(store.secret).toBeUndefined()
      expect(grants).toEqual(["authorization_code", "refresh_token"])
      expect(
        createHash("sha256")
          .update(inputs[0]?.get("code_verifier") ?? "")
          .digest("base64url")
      ).toBe(challenge)
      expect(inputs[0]?.get("code")).toBe("single-use-code")
      expect(inputs[0]?.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
      expect(inputs[1]?.get("refresh_token")).toBe("refresh-one")
      expect(await readFile(join(root, "profiles", "test.json"), "utf8")).not.toContain("access-")
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it.runIf(process.platform === "win32")(
    "protects stored credentials with DPAPI and secret files with a current-user ACL",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "copacker-protection-test-"))
      directories.push(root)
      const store = new LocalStore(root)
      const credential: LoginSecret = { accessToken: "isolated-test-secret", kind: "automation" }
      await store.saveCredential("test", credential)
      expect(await store.credential("test")).toEqual(credential)
      expect(await readFile(join(root, "credentials", "test.dpapi"), "utf8")).not.toContain(credential.accessToken)
      await store.clearCredential("test")
      expect(await store.credential("test")).toBeUndefined()
      const path = join(root, "one-use-secret.txt")
      const sink = await secretFile(path)
      await sink.write(credential.accessToken)
      expect(await readFile(path, "utf8")).toBe(credential.accessToken)
      await expect(secretFile(path)).rejects.toThrow("EEXIST")
    }
  )
})
