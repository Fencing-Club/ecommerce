import { createHash, randomUUID } from "node:crypto"
import { chmod, link, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises"
import { basename, extname, resolve } from "node:path"
import { clientError, type CopackerClient } from "@repo/copacker-client"
import {
  artifactSchema,
  handoffSchema,
  jsonObject,
  type JsonObject,
  type SuccessEnvelope
} from "@repo/copacker-contract"

export async function atomicWrite(path: string, bytes: string | Uint8Array, overwrite = false): Promise<void> {
  const destination = resolve(path)
  const temporary = `${destination}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, "wx", 0o600)
    try {
      await file.writeFile(bytes)
      await file.sync()
    } finally {
      await file.close()
    }
    if (overwrite) {
      await rename(temporary, destination)
    } else {
      await link(temporary, destination)
      await rm(temporary)
    }
  } catch (error) {
    await rm(temporary, { force: true })
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw clientError("invalid_input", "The output file already exists. Use --overwrite to replace it.")
    }
    throw clientError("invalid_input", "Could not save the output file. Check its directory and permissions.")
  }
}

export async function privateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 })
  if (process.platform !== "win32") {
    await chmod(path, 0o700)
  }
}

export async function uploadFile(
  client: CopackerClient,
  operation: string,
  path: string,
  input: JsonObject,
  key: string,
  intentId: string,
  expectedDigest?: string
): Promise<SuccessEnvelope> {
  const descriptor = await client.describe(operation)
  const maxBytes = descriptor.limits.maxFileBytes
  if (!maxBytes) {
    throw clientError("unsupported_contract", "This operation has no deployed upload capability.", 409)
  }
  const handle = await open(path, "r")
  let bytes: Buffer
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size === 0 || info.size > maxBytes) {
      throw clientError("invalid_input", `The upload must be a file of 1–${maxBytes} bytes.`)
    }
    bytes = await handle.readFile()
    if (bytes.length !== info.size) {
      throw clientError("invalid_input", "The file changed while it was being read.")
    }
  } finally {
    await handle.close()
  }
  const types: Record<string, string> = {
    ".pdf": "application/pdf",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
  }
  const mediaType = types[extname(path).toLowerCase()]
  if (!mediaType) {
    throw clientError("invalid_input", "This file type is not supported.")
  }
  const digest = createHash("sha256").update(bytes).digest("hex")
  if (expectedDigest && digest !== expectedDigest) {
    throw clientError(
      "invalid_input",
      "The upload changed after its execution identity was recorded. Run the command again."
    )
  }
  const prepared = await client.call(
    operation,
    {
      ...input,
      phase: "prepare",
      intentId,
      file: { filename: basename(path), mediaType, size: bytes.length, sha256: digest }
    },
    { idempotencyKey: `${key}/prepare`, descriptor }
  )
  const handoff = handoffSchema.safeParse(prepared.data)
  // A consumed prepare may return the completed entity receipt. Never restage completed work.
  if (!handoff.success) {
    return prepared
  }
  if (handoff.data.intentId !== intentId) {
    throw clientError("unsupported_contract", "The upload handoff belongs to another intent.", 409)
  }
  const response = await client.transfer(handoff.data.upload.url, {
    method: "PUT",
    headers: { "Content-Type": mediaType, "Content-Length": String(bytes.length), "X-Content-SHA256": digest },
    body: new Uint8Array(bytes)
  })
  await response.body?.cancel()
  return client.call(
    operation,
    { phase: "complete", intentId, handoffId: handoff.data.handoffId, sha256: digest },
    { idempotencyKey: `${key}/complete`, descriptor }
  )
}

const artifactIdleMs = 60000

export async function saveArtifact(
  client: CopackerClient,
  result: SuccessEnvelope,
  path: string,
  overwrite: boolean
): Promise<boolean> {
  const record = jsonObject.safeParse(result.data)
  const parsed = artifactSchema.safeParse(record.success && record.data.artifact ? record.data.artifact : result.data)
  if (!parsed.success) {
    return false
  }
  const artifact = parsed.data
  const destination = resolve(path)
  const temporary = `${destination}.${randomUUID()}.tmp`
  const maxBytes = 256 * 1024 * 1024
  if (artifact.size !== null && artifact.size > maxBytes) {
    throw clientError("invalid_input", "The artifact exceeds the 256 MiB download limit.")
  }
  if (!overwrite) {
    try {
      await stat(destination)
      throw clientError("invalid_input", "The output file already exists. Use --overwrite to replace it.")
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error
      }
    }
  }
  // A large artifact streams for as long as it keeps arriving; a minute without data abandons it.
  const idle = new AbortController()
  let stalled = setTimeout(() => idle.abort(), artifactIdleMs)
  const response = await client.transfer(artifact.download.url, { signal: idle.signal })
  if (!response.body) {
    clearTimeout(stalled)
    throw clientError("transfer_failed", "The artifact response has no body.", 502)
  }
  const file = await open(temporary, "wx", 0o600)
  let size = 0
  const digest = createHash("sha256")
  try {
    const reader = response.body.getReader()
    try {
      while (true) {
        clearTimeout(stalled)
        stalled = setTimeout(() => idle.abort(), artifactIdleMs)
        const chunk = await reader.read()
        if (chunk.done) {
          break
        }
        size += chunk.value.length
        if (size > maxBytes || (artifact.size !== null && size > artifact.size)) {
          throw clientError("transfer_failed", "The downloaded artifact exceeds its declared size.", 502)
        }
        digest.update(chunk.value)
        await file.writeFile(chunk.value)
      }
    } finally {
      clearTimeout(stalled)
      await reader.cancel()
      reader.releaseLock()
    }
    if (
      (artifact.size !== null && size !== artifact.size) ||
      (artifact.sha256 !== null && digest.digest("hex") !== artifact.sha256)
    ) {
      throw clientError("transfer_failed", "The artifact failed its size or SHA256 integrity check.", 502)
    }
    await file.sync()
    await file.close()
    if (overwrite) {
      await rename(temporary, destination)
    } else {
      await link(temporary, destination)
      await rm(temporary)
    }
    return true
  } catch (error) {
    await file.close().catch(() => undefined)
    await rm(temporary, { force: true })
    if (idle.signal.aborted) {
      throw clientError("transfer_failed", "The artifact download stalled. Repeat the command to try again.", 504)
    }
    throw error
  }
}

export async function fileFingerprint(path: string): Promise<string> {
  const info = await stat(path)
  if (!info.isFile() || info.size > 32 * 1024 * 1024) {
    throw clientError("invalid_input", "The file must be no larger than 32 MiB.")
  }
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex")
}
