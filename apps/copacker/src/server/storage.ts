import { AsyncLocalStorage } from "node:async_hooks"
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, NoSuchKey } from "@aws-sdk/client-s3"
import { PDFDocument, PDFDict, PDFName } from "pdf-lib"
import { LocalizedError } from "@/i18n/errors"

export type StoredFile = { body: ReadableStream<Uint8Array>; size?: number; contentType?: string }
// Where private files are kept. `get` answers null for a key that holds no file.
export type FileStorage = {
  put: (key: string, bytes: Uint8Array, contentType: string) => Promise<void>
  get: (key: string) => Promise<StoredFile | null>
  delete: (key: string) => Promise<void>
}
const invocation = new AsyncLocalStorage<FileStorage>()

// A Worker supplies its private bucket for this invocation. Local development and storage migration tools use S3.
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

// The calls r2FileStorage makes on a Worker's R2 bucket binding. This module also runs in Node, which doesn't load the
// Workers types, so they're spelled out here.
type R2Files = {
  put: (key: string, value: Uint8Array, options: { httpMetadata: { contentType: string } }) => Promise<unknown>
  get: (key: string) => Promise<{
    body: ReadableStream<Uint8Array>
    size: number
    httpMetadata?: { contentType?: string }
  } | null>
  delete: (key: string) => Promise<void>
}

// A Worker's private bucket, through its native R2 binding.
export function r2FileStorage(bucket: R2Files): FileStorage {
  return {
    async put(key, bytes, contentType) {
      await bucket.put(key, bytes, { httpMetadata: { contentType } })
    },
    async get(key) {
      const file = await bucket.get(key)
      return file && { body: file.body, size: file.size, contentType: file.httpMetadata?.contentType }
    },
    delete: (key) => bucket.delete(key)
  }
}

// The bucket through its S3 API, for the Node worker, local tools and storage migrations. Each call opens its own
// client and closes it once done; a read closes it once its stream is read, fails or is cancelled.
function s3FileStorage(): FileStorage {
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET } = process.env
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET) {
    throw new Error("Document storage is not configured")
  }
  const connect = () =>
    new S3Client({
      endpoint: S3_ENDPOINT,
      region: "auto",
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
      forcePathStyle: true
    })
  return {
    async put(key, bytes, contentType) {
      const client = connect()
      try {
        await client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: bytes, ContentType: contentType }))
      } finally {
        client.destroy()
      }
    },
    async get(key) {
      const client = connect()
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }))
        if (!result.Body) {
          client.destroy()
          return null
        }
        const body = closingStream(result.Body.transformToWebStream(), client)
        return { body, size: result.ContentLength, contentType: result.ContentType }
      } catch (error) {
        client.destroy()
        if (error instanceof NoSuchKey) {
          return null
        }
        throw error
      }
    },
    async delete(key) {
      const client = connect()
      try {
        await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }))
      } finally {
        client.destroy()
      }
    }
  }
}

// An S3 object's stream, which closes its client once it's read to the end, fails or is cancelled.
function closingStream(source: ReadableStream<Uint8Array>, client: S3Client) {
  const reader = source.getReader()
  return new ReadableStream<Uint8Array>(
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
}

// The invocation's bucket, or S3 outside a Worker.
function files() {
  return invocation.getStore() ?? s3FileStorage()
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
  await files().put(key, bytes, contentType)
}

// Downloads pass the stream straight to the response. Only document processors call getFile to materialize bytes.
export async function readFile(key: string): Promise<StoredFile> {
  const file = await files().get(key)
  if (!file) {
    throw new LocalizedError("documentUnavailable")
  }
  return file
}
export async function getFile(key: string) {
  const file = await readFile(key)
  return new Uint8Array(await new Response(file.body).arrayBuffer())
}
export async function deleteFile(key: string) {
  await files().delete(key)
}
