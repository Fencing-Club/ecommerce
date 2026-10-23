import { randomUUID, createHash } from "node:crypto"
import { artifactSchema, handoffSchema, fileMetadataSchema } from "@repo/copacker-contract"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { operationReceipts } from "@/db/schema"
import { can } from "@/lib/access"
import { cliPrincipal, CliError } from "./cli-auth"
import { appUrl } from "./security"
import { getFile, readFile, putFile } from "./storage"
import { workspaceSession, type Session } from "./workspace-session"

export const fileLimit = 5 * 1024 * 1024
export const uploadReceipt = handoffSchema.extend({ file: fileMetadataSchema, locationId: z.string().nullable() })
const transferOperations = [
  "product.import",
  "inventory.import",
  "product.export",
  "inventory.export",
  "product.template"
]
export function transferKey(s: Session, id: string) {
  return `cli-transfers/${s.org.id}/${s.user.id}/${id}`
}
export function transferUrl(s: Session, id: string) {
  return `${appUrl()}/api/cli/transfers/${id}?workspaceId=${s.org.id}`
}
export function prepareUpload(
  s: Session,
  input: { intentId: string; file: z.infer<typeof fileMetadataSchema>; locationId?: string }
) {
  const handoffId = randomUUID()
  if (input.file.size > fileLimit) {
    throw new CliError("invalid_input", "Files must not exceed 5 MB.")
  }
  return {
    intentId: input.intentId,
    handoffId,
    file: input.file,
    locationId: input.locationId ?? null,
    expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
    upload: { url: transferUrl(s, handoffId), method: "PUT" as const, authentication: "required" as const }
  }
}
export async function transferReceipt(s: Session, id: string, operation?: string) {
  const [receipt] = await db()
    .select()
    .from(operationReceipts)
    .where(
      and(
        eq(operationReceipts.orgId, s.org.id),
        eq(operationReceipts.userId, s.user.id),
        operation ? eq(operationReceipts.operation, operation) : undefined,
        sql`(${operationReceipts.result}->>'handoffId' = ${id} or ${operationReceipts.result}->>'id' = ${id})`
      )
    )
    .orderBy(operationReceipts.createdAt)
    .limit(1)
  if (!receipt || !transferOperations.includes(receipt.operation)) {
    throw new CliError("not_found", "Transfer not found.", 404)
  }
  return receipt
}
export async function uploadedBytes(s: Session, id: string, operation: string) {
  const receipt = await transferReceipt(s, id, operation)
  const upload = uploadReceipt.parse(receipt.result)
  if (Date.parse(upload.expiresAt) <= Date.now()) {
    throw new CliError("transfer_expired", "Start a new import; this upload expired.", 409)
  }
  const bytes = await getFile(transferKey(s, id))
  if (bytes.length !== upload.file.size || createHash("sha256").update(bytes).digest("hex") !== upload.file.sha256) {
    throw new CliError("invalid_upload", "Uploaded bytes do not match the prepared file.", 409)
  }
  return { upload, bytes }
}
export async function saveExport(s: Session, bytes: Uint8Array, filename: string, mediaType: string) {
  const id = randomUUID()
  await putFile(transferKey(s, id), bytes, mediaType)
  return {
    id,
    filename,
    mediaType,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    revision: null,
    sourceIds: [],
    expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
    download: { url: transferUrl(s, id), authentication: "required" as const }
  }
}
export async function cliTransfer(request: Request, id: string) {
  try {
    if (!z.uuid().safeParse(id).success) {
      throw new CliError("invalid_input", "Invalid transfer ID.")
    }
    const principal = await cliPrincipal(request)
    const workspaceId = new URL(request.url).searchParams.get("workspaceId")
    if (!workspaceId) {
      throw new CliError("invalid_input", "Select a workspace.")
    }
    const s = await workspaceSession(principal.user, workspaceId)
    if (!s || s.org.kind !== "supplier") {
      throw new CliError("not_found", "Transfer not found.", 404)
    }
    const receipt = await transferReceipt(s, id)
    const inventory = receipt.operation.startsWith("inventory.")
    if (
      !can(s, inventory ? "inventory" : "products", request.method === "PUT" ? "edit" : "view") ||
      (!inventory && !can(s, "prices")) ||
      (receipt.operation === "product.export" && !can(s, "inventory"))
    ) {
      throw new CliError("forbidden", "Transfer permission changed.", 403)
    }
    const upload = uploadReceipt.safeParse(receipt.result)
    const artifact = artifactSchema.safeParse(receipt.result)
    let expiresAt: string | null = null
    if (upload.success) {
      expiresAt = upload.data.expiresAt
    } else if (artifact.success) {
      expiresAt = artifact.data.expiresAt
    }
    if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
      throw new CliError("transfer_expired", "This transfer expired.", 409)
    }
    if (request.method === "PUT" && upload.success) {
      if (
        request.headers.get("content-type") !== upload.data.file.mediaType ||
        request.headers.get("x-content-sha256") !== upload.data.file.sha256
      ) {
        throw new CliError("invalid_upload", "Upload metadata does not match.")
      }
      const reader = request.body?.getReader()
      if (!reader) {
        throw new CliError("invalid_upload", "File body required.")
      }
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        for (;;) {
          const part = await reader.read()
          if (part.done) {
            break
          }
          size += part.value.byteLength
          if (size > upload.data.file.size || size > fileLimit) {
            await reader.cancel()
            throw new CliError("invalid_upload", "Upload exceeds prepared size.", 413)
          }
          chunks.push(part.value)
        }
      } finally {
        reader.releaseLock()
      }
      const bytes = Buffer.concat(chunks)
      if (
        size !== upload.data.file.size ||
        createHash("sha256").update(bytes).digest("hex") !== upload.data.file.sha256
      ) {
        throw new CliError("invalid_upload", "Upload digest does not match.")
      }
      await putFile(transferKey(s, id), bytes, upload.data.file.mediaType)
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
    }
    if (request.method === "GET" && artifact.success) {
      const file = await readFile(transferKey(s, id))
      if (!file) {
        throw new CliError("not_found", "Export not found.", 404)
      }
      return new Response(file.body, {
        headers: {
          "Content-Type": artifact.data.mediaType,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox"
        }
      })
    }
    throw new CliError("invalid_input", "Unsupported transfer method.", 405)
  } catch (error) {
    return Response.json(
      { error: error instanceof CliError ? error.code : "transfer_failed" },
      { status: error instanceof CliError ? error.status : 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}
