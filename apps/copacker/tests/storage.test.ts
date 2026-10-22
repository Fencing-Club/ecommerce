import { NoSuchKey } from "@aws-sdk/client-s3"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  deleteFile,
  getFile,
  putFile,
  r2FileStorage,
  readFile,
  withFileStorage,
  type FileStorage
} from "../src/server/storage"

const s3 = vi.hoisted(() => ({
  send: vi.fn<
    (command: unknown) => Promise<{
      Body?: { transformToWebStream: () => ReadableStream<Uint8Array> }
      ContentLength?: number
      ContentType?: string
    }>
  >(),
  destroy: vi.fn<() => void>()
}))
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...(await original<typeof import("@aws-sdk/client-s3")>()),
  S3Client: class {
    send = s3.send
    destroy = s3.destroy
  }
}))
const bytes = new TextEncoder().encode("private file")
function stream(cancel: () => void = () => undefined) {
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
      cancel
    },
    { highWaterMark: 0 }
  )
}
function bucket(text: string): FileStorage {
  return {
    put: vi.fn<FileStorage["put"]>(async () => undefined),
    delete: vi.fn<FileStorage["delete"]>(async () => undefined),
    get: vi.fn<FileStorage["get"]>(async () => ({
      body: new Response(text).body!,
      contentType: "text/plain",
      size: text.length
    }))
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  for (const key of ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"]) {
    vi.stubEnv(key, "configured-test-value")
  }
})
afterEach(() => vi.unstubAllEnvs())

describe("invocation storage", () => {
  it("keeps concurrent bucket bindings isolated across awaits and restores the outer binding", async () => {
    const first = bucket("first"),
      second = bucket("second")
    const result = await Promise.all(
      [first, second].map((files) =>
        withFileStorage(files, async () => {
          await Promise.resolve()
          const own = await getFile("same-key")
          const nested = await withFileStorage(bucket("nested"), () => getFile("same-key"))
          const restored = await getFile("same-key")
          return [own, nested, restored].map((value) => new TextDecoder().decode(value))
        })
      )
    )
    expect(result).toEqual([
      ["first", "nested", "first"],
      ["second", "nested", "second"]
    ])
    expect(s3.send).not.toHaveBeenCalled()
  })
  it("uses the active binding for writes and deletes with the original key and content type", async () => {
    const files = bucket("value")
    await withFileStorage(files, async () => {
      await putFile("private/key", bytes, "image/png")
      await deleteFile("private/key")
    })
    expect(files.put).toHaveBeenCalledWith("private/key", bytes, "image/png")
    expect(files.delete).toHaveBeenCalledWith("private/key")
  })
  it("rejects missing objects instead of returning an empty successful document", async () => {
    await expect(
      withFileStorage({ ...bucket("unused"), get: async () => null }, () => getFile("missing"))
    ).rejects.toThrow("Document is unavailable")
  })
  it("restores storage context after failure", async () => {
    await expect(
      withFileStorage(bucket("bound"), async () => {
        throw new Error("failed")
      })
    ).rejects.toThrow("failed")
    vi.stubEnv("S3_BUCKET", "")
    await expect(getFile("outside")).rejects.toThrow("Document storage is not configured")
  })
})

describe("R2 binding", () => {
  it("keeps each file's key, content type and size, and reads a deleted key as unavailable", async () => {
    const objects = new Map<string, { bytes: Uint8Array; contentType: string }>()
    const bucket = {
      put: vi.fn<(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string } }) => Promise<void>>(
        async (key, value, options) => {
          objects.set(key, { bytes: value, contentType: options.httpMetadata.contentType })
        }
      ),
      get: async (key: string) => {
        const object = objects.get(key)
        return object
          ? {
              body: new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(object.bytes)
                  controller.close()
                }
              }),
              size: object.bytes.length,
              httpMetadata: { contentType: object.contentType }
            }
          : null
      },
      delete: async (key: string) => {
        objects.delete(key)
      }
    }
    await withFileStorage(r2FileStorage(bucket), async () => {
      await putFile("private/key", bytes, "image/png")
      await putFile("private/document", bytes)
      expect(await readFile("private/key")).toMatchObject({ size: bytes.length, contentType: "image/png" })
      expect(await getFile("private/key")).toEqual(bytes)
      await deleteFile("private/key")
      await expect(readFile("private/key")).rejects.toThrow("Document is unavailable")
    })
    expect(bucket.put.mock.calls.map(([key, , options]) => [key, options])).toEqual([
      ["private/key", { httpMetadata: { contentType: "image/png" } }],
      ["private/document", { httpMetadata: { contentType: "application/pdf" } }]
    ])
    expect(s3.send).not.toHaveBeenCalled()
  })
})

describe("retained Node S3 transport", () => {
  it("keeps the client alive until the response stream is consumed", async () => {
    s3.send.mockResolvedValue({
      Body: { transformToWebStream: () => stream() },
      ContentLength: bytes.length,
      ContentType: "application/pdf"
    })
    const file = await readFile("private/key")
    expect(s3.destroy).not.toHaveBeenCalled()
    expect(file).toMatchObject({ size: bytes.length, contentType: "application/pdf" })
    expect(new Uint8Array(await new Response(file.body).arrayBuffer())).toEqual(bytes)
    expect(s3.destroy).toHaveBeenCalledOnce()
  })
  it("cancels the source and closes the client when authorization rejects a pending download", async () => {
    const cancel = vi.fn<() => void>()
    s3.send.mockResolvedValue({ Body: { transformToWebStream: () => stream(cancel) } })
    const file = await readFile("private/key")
    await file.body.cancel()
    expect(cancel).toHaveBeenCalledOnce()
    expect(s3.destroy).toHaveBeenCalledOnce()
  })
  it("reads a missing object as unavailable, and closes its client", async () => {
    s3.send.mockRejectedValue(new NoSuchKey({ message: "missing", $metadata: {} }))
    await expect(readFile("private/key")).rejects.toThrow("Document is unavailable")
    s3.send.mockResolvedValue({})
    await expect(readFile("private/key")).rejects.toThrow("Document is unavailable")
    expect(s3.destroy).toHaveBeenCalledTimes(2)
  })
  it("closes the client after storage read failure", async () => {
    s3.send.mockRejectedValue(new Error("offline"))
    await expect(readFile("private/key")).rejects.toThrow("offline")
    expect(s3.destroy).toHaveBeenCalledOnce()
  })
  it("closes the client on stream failure", async () => {
    s3.send.mockResolvedValue({
      Body: {
        transformToWebStream: () =>
          new ReadableStream({
            pull(controller) {
              controller.error(new Error("connection lost"))
            }
          })
      }
    })
    const file = await readFile("private/key")
    await expect(new Response(file.body).arrayBuffer()).rejects.toThrow("connection lost")
    expect(s3.destroy).toHaveBeenCalledOnce()
  })
  it("closes each write/delete client even when the operation fails", async () => {
    s3.send.mockResolvedValue({})
    await putFile("private/key", bytes)
    expect(s3.destroy).toHaveBeenCalledTimes(1)
    s3.send.mockRejectedValue(new Error("offline"))
    await expect(deleteFile("private/key")).rejects.toThrow("offline")
    expect(s3.destroy).toHaveBeenCalledTimes(2)
  })
})
