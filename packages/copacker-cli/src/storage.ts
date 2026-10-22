import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { open, readFile, realpath, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { apiOrigin, clientError } from "@repo/copacker-client"
import { canonicalJson, type JsonObject } from "@repo/copacker-contract"
import { z } from "zod"
import { atomicWrite, privateDirectory } from "./files.ts"

const profileName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/)
const profileSchema = z.strictObject({ baseUrl: z.string(), workspaceId: z.uuid().optional() })
export const loginSecretSchema = z.strictObject({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresAt: z.number().optional(),
  kind: z.enum(["interactive", "automation"])
})
export type LoginSecret = z.infer<typeof loginSecretSchema>
const protectedCredentialSchema = z.strictObject({ origin: z.string(), secret: loginSecretSchema })
const receiptSchema = z.strictObject({
  key: z.string(),
  intentId: z.uuid(),
  createdAt: z.number(),
  completed: z.boolean(),
  expiresAt: z.string().optional()
})
export type Receipt = z.infer<typeof receiptSchema>

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined
    }
    throw clientError("invalid_input", "A local Copacker settings file could not be read.")
  }
}

// `absent` lists exit codes that mean the item doesn't exist (secret-tool exits 1, security exits 44); those resolve to
// empty output instead of a credential-service failure.
export function runProtected(
  program: string,
  args: string[],
  input = "",
  absent: readonly number[] = []
): Promise<string> {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env }
    // PowerShell 7's inherited module path can break Windows PowerShell's native security modules.
    if (program === "powershell.exe") {
      delete environment.PSModulePath
    }
    const child = spawn(program, args, { env: environment, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
    const chunks: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill()
      reject(clientError("credential_store_unavailable", "The operating-system credential service timed out."))
    }, 15000)
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.stderr.resume()
    child.on("error", () => {
      clearTimeout(timer)
      reject(
        clientError(
          "credential_store_unavailable",
          "The operating-system credential service is unavailable. Use COPACKER_TOKEN for headless runs."
        )
      )
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString("utf8").trim())
      } else if (code !== null && absent.includes(code)) {
        resolve("")
      } else {
        reject(
          clientError("credential_store_unavailable", "The operating-system credential service rejected the request.")
        )
      }
    })
    child.stdin.on("error", () => undefined)
    child.stdin.end(input)
  })
}

export class LocalStore {
  readonly directory: string
  constructor(directory = process.env.COPACKER_CONFIG_DIR ?? join(homedir(), ".config", "copacker")) {
    this.directory = resolve(directory)
  }
  private async credentialService() {
    await privateDirectory(this.directory)
    const directory = await realpath(this.directory)
    return `copacker-${createHash("sha256").update(directory).digest("hex")}`
  }
  private async decodeCredential(name: string, plain: string) {
    const parsed = protectedCredentialSchema.safeParse(JSON.parse(plain))
    if (!parsed.success || parsed.data.origin !== apiOrigin((await this.profile(name)).baseUrl)) {
      throw clientError(
        "credential_origin_mismatch",
        "The stored credential does not match this profile's API origin. Sign in again."
      )
    }
    return parsed.data.secret
  }
  async withCredentialLock<T>(profile: string, run: () => Promise<T>): Promise<T> {
    const path = join(this.directory, "credentials", `${profileName.parse(profile)}.lock`)
    await privateDirectory(dirname(path))
    const deadline = Date.now() + 60_000
    for (;;) {
      let handle
      try {
        handle = await open(path, "wx", 0o600)
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
          throw error
        }
        if (Date.now() >= deadline) {
          throw clientError(
            "credential_busy",
            `Another command is updating this profile. If it stopped unexpectedly, confirm no Copacker command is running before removing ${path}.`
          )
        }
        await delay(100)
        continue
      }
      try {
        return await run()
      } finally {
        await handle.close()
        await rm(path)
      }
    }
  }
  private profilePath(name: string) {
    return join(this.directory, "profiles", `${profileName.parse(name)}.json`)
  }
  async replaceCredential(name: string, settings: z.infer<typeof profileSchema>, secret: LoginSecret) {
    const parsed = profileSchema.parse(settings)
    await this.withCredentialLock(name, async () => {
      const previous = await this.profile(name)
      const sameOrigin = apiOrigin(previous.baseUrl) === apiOrigin(parsed.baseUrl)
      // A failed replacement must never bind one origin's secret to another origin.
      if (!sameOrigin) {
        await this.clearCredential(name)
      }
      await this.saveProfile(name, sameOrigin ? { ...previous, ...parsed } : parsed)
      await this.saveCredential(name, secret)
    })
  }
  private secretPath(name: string) {
    return join(this.directory, "credentials", `${profileName.parse(name)}.dpapi`)
  }
  async profile(name: string) {
    const value = await readJson(this.profilePath(name))
    return value === undefined ? { baseUrl: "https://copacker.ai" } : profileSchema.parse(value)
  }
  async saveProfile(name: string, value: z.infer<typeof profileSchema>) {
    const path = this.profilePath(name)
    apiOrigin(value.baseUrl)
    await privateDirectory(dirname(path))
    await atomicWrite(path, JSON.stringify(profileSchema.parse(value)), true)
  }
  async credential(name: string): Promise<LoginSecret | undefined> {
    profileName.parse(name)
    if (process.platform === "win32") {
      let encrypted: string
      try {
        encrypted = await readFile(this.secretPath(name), "utf8")
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return undefined
        }
        throw error
      }
      const plain = await runProtected(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Add-Type -AssemblyName System.Security; $data = [Convert]::FromBase64String([Console]::In.ReadToEnd()); $plain = [Security.Cryptography.ProtectedData]::Unprotect($data, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))"
        ],
        encrypted
      )
      return this.decodeCredential(name, plain)
    }
    if (process.platform === "linux") {
      try {
        const plain = await runProtected(
          "secret-tool",
          ["lookup", "service", await this.credentialService(), "profile", name],
          "",
          [1]
        )
        return plain ? await this.decodeCredential(name, plain) : undefined
      } catch (error) {
        if (error instanceof SyntaxError) {
          return undefined
        }
        throw error
      }
    }
    if (process.platform === "darwin") {
      try {
        const plain = await runProtected(
          "security",
          ["find-generic-password", "-s", await this.credentialService(), "-a", name, "-w"],
          "",
          [44]
        )
        return plain ? await this.decodeCredential(name, plain) : undefined
      } catch (error) {
        if (error instanceof SyntaxError) {
          return undefined
        }
        throw error
      }
    }
    throw clientError("credential_store_unavailable", "This operating system requires COPACKER_TOKEN.")
  }
  async saveCredential(name: string, value: LoginSecret) {
    profileName.parse(name)
    const plain = JSON.stringify({
      origin: apiOrigin((await this.profile(name)).baseUrl),
      secret: loginSecretSchema.parse(value)
    })
    if (process.platform === "win32") {
      const encrypted = await runProtected(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Add-Type -AssemblyName System.Security; $data = [Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($data, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)))"
        ],
        plain
      )
      const path = this.secretPath(name)
      await privateDirectory(dirname(path))
      await atomicWrite(path, encrypted, true)
      return
    }
    if (process.platform === "linux") {
      await runProtected(
        "secret-tool",
        ["store", "--label=Copacker CLI", "service", await this.credentialService(), "profile", name],
        plain
      )
      return
    }
    if (process.platform === "darwin") {
      // security's interactive input keeps the secret out of process arguments.
      const quoted = plain.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
      await runProtected(
        "security",
        ["-i"],
        `add-generic-password -U -s ${await this.credentialService()} -a ${name} -w "${quoted}"\n`
      )
      return
    }
    throw clientError("credential_store_unavailable", "This operating system requires COPACKER_TOKEN.")
  }
  async clearCredential(name: string) {
    profileName.parse(name)
    if (process.platform === "win32") {
      await rm(this.secretPath(name), { force: true })
    } else if (process.platform === "linux") {
      await runProtected("secret-tool", ["clear", "service", await this.credentialService(), "profile", name], "", [1])
    } else if (process.platform === "darwin") {
      await runProtected(
        "security",
        ["delete-generic-password", "-s", await this.credentialService(), "-a", name],
        "",
        [44]
      )
    }
  }
  async execution(
    scope: JsonObject,
    explicitKey?: string,
    expiresAt?: string
  ): Promise<{ path: string; receipt: Receipt }> {
    const fingerprint = createHash("sha256")
      .update(canonicalJson({ ...scope, explicitKey: explicitKey ?? null }))
      .digest("hex")
    const path = join(this.directory, "receipts", `${fingerprint}.json`)
    await privateDirectory(dirname(path))
    const previous = await readJson(path)
    const stored = previous === undefined ? undefined : receiptSchema.parse(previous)
    const now = Date.now()
    if (stored && now - stored.createdAt < 7 * 86400000 && (!explicitKey || stored.key === explicitKey)) {
      return { path, receipt: stored }
    }
    if (stored) {
      throw clientError(
        "idempotency_expired",
        "The retained intent is outside the server's seven-day replay window. Inspect the entity before choosing an explicit new execution key.",
        409,
        { key: stored.key }
      )
    }
    const receipt = {
      key: explicitKey ?? randomUUID(),
      intentId: randomUUID(),
      createdAt: now,
      completed: false,
      expiresAt
    }
    try {
      await atomicWrite(path, JSON.stringify(receipt), stored !== undefined)
    } catch (error) {
      // Another invocation of the same intent may have won the exclusive create.
      const winner = await readJson(path)
      if (winner === undefined) {
        throw error
      }
      const parsed = receiptSchema.parse(winner)
      if (explicitKey && parsed.key !== explicitKey) {
        throw error
      }
      return { path, receipt: parsed }
    }
    return { path, receipt }
  }
  async complete(execution: { path: string; receipt: Receipt }) {
    await atomicWrite(execution.path, JSON.stringify({ ...execution.receipt, completed: true }), true)
  }
}

/** Establish protection before asking the server to consume a one-use secret delivery. */
export async function secretFile(path: string) {
  if (!isAbsolute(path)) {
    throw clientError("invalid_input", "--secret-file requires an absolute path.")
  }
  const handle = await open(path, "wx", 0o600)
  try {
    if (process.platform === "win32") {
      await runProtected(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "$ErrorActionPreference = 'Stop'; $path = [Console]::In.ReadToEnd(); $acl = New-Object Security.AccessControl.FileSecurity; $acl.SetAccessRuleProtection($true,$false); $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User; $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow'); $acl.AddAccessRule($rule); [IO.File]::SetAccessControl($path,$acl)"
        ],
        path
      )
    }
    return {
      write: async (secret: string) => {
        await handle.writeFile(secret)
        await handle.sync()
        await handle.close()
      },
      cancel: async () => {
        await handle.close()
        await rm(path, { force: true })
      }
    }
  } catch (error) {
    await handle.close()
    await rm(path, { force: true })
    throw error
  }
}
