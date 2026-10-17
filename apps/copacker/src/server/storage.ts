import { AsyncLocalStorage } from "node:async_hooks"
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, NoSuchKey } from "@aws-sdk/client-s3"
import { PDFDocument, PDFDict, PDFName } from "pdf-lib"
import { LocalizedError } from "@/i18n/errors"

export type StoredFile = { body: ReadableStream<Uint8Array>; size?: number; contentType?: string }
export type FileStorage = {
  put: (key: string, bytes: Uint8Array, contentType: string) => Promise<void>
  get: (key: string) => Promise<StoredFile | null>
  delete: (key: string) => Promise<void>
}
const invocation = new AsyncLocalStorage<FileStorage>()

// A Worker supplies its private bucket for this invocation. The retained Node worker uses its S3 configuration.
export function withFileStorage<T>(files: FileStorage, run: () => T, prefix = ""): T {
  if (prefix && !/^previews\/pr-[1-9]\d*\/app\/$/.test(prefix)) {
    throw new Error("Invalid preview storage prefix")
  }
  // R2 keys are literal strings. Prefix every operation; a preview never falls back to the bucket root.
  return invocation.run(
    prefix
      ? {
          put: (key, bytes, contentType) => files.put(`${prefix}${key}`, bytes, contentType),
          get: (key) => files.get(`${prefix}${key}`),
          delete: (key) => files.delete(`${prefix}${key}`)
        }
      : files,
    run
  )
}
function storage() {
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET } = process.env
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET) {
    throw new Error("Document storage is not configured")
  }
  return {
    client: new S3Client({
      endpoint: S3_ENDPOINT,
      region: "auto",
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
      forcePathStyle: true
    }),
    bucket: S3_BUCKET
  }
}
export async function validatePdf(bytes: Uint8Array) {
  if (bytes.length < 5 || bytes.length > 32 * 1024 * 1024 || Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") {
    throw new LocalizedError("uploadPdfUnder32")
  }
  const doc = await PDFDocument.load(bytes)
  if (doc.getPageCount() < 1 || doc.getPageCount() > 1000) {
    throw new LocalizedError("pdfPageCount")
  }
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (
      object instanceof PDFDict &&
      ["JavaScript", "JS", "Launch", "EmbeddedFiles", "OpenAction", "AA"].some((name) => object.has(PDFName.of(name)))
    ) {
      throw new LocalizedError("pdfActiveContent")
    }
  }
}
export async function putFile(key: string, bytes: Uint8Array, contentType = "application/pdf") {
  const files = invocation.getStore()
  if (files) {
    return files.put(key, bytes, contentType)
  }
  const { client, bucket } = storage()
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }))
  } finally {
    client.destroy()
  }
}

// Downloads pass the stream straight to the response. Only document processors call getFile to materialize bytes.
export async function readFile(key: string): Promise<StoredFile> {
  const files = invocation.getStore()
  if (files) {
    const file = await files.get(key)
    if (!file) {
      throw new LocalizedError("documentUnavailable")
    }
    return file
  }
  const { client, bucket } = storage()
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    if (!result.Body) {
      throw new LocalizedError("documentUnavailable")
    }
    const reader = result.Body.transformToWebStream().getReader()
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          try {
            const chunk = await reader.read()
            if (chunk.done) {
              controller.close()
              client.destroy()
            } else {
              controller.enqueue(chunk.value)
            }
          } catch (error) {
            controller.error(error)
            client.destroy()
          }
        },
        async cancel(reason) {
          try {
            await reader.cancel(reason)
          } finally {
            client.destroy()
          }
        }
      },
      { highWaterMark: 0 }
    )
    return { body, size: result.ContentLength, contentType: result.ContentType }
  } catch (error) {
    client.destroy()
    if (error instanceof NoSuchKey) {
      throw new LocalizedError("documentUnavailable")
    }
    throw error
  }
}
export async function getFile(key: string) {
  const file = await readFile(key)
  return new Uint8Array(await new Response(file.body).arrayBuffer())
}
export async function deleteFile(key: string) {
  const files = invocation.getStore()
  if (files) {
    return files.delete(key)
  }
  const { client, bucket } = storage()
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  } finally {
    client.destroy()
  }
}
