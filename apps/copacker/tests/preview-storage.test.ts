import { expect, it } from "vitest"
import { deleteFile, getFile, putFile, withFileStorage, type FileStorage } from "../src/server/storage"

it("keeps staging and PR files separate in one bucket across uploads, reads and deletes", async () => {
  const stored = new Map<string, Uint8Array>([["invoice.pdf", new Uint8Array([0])]])
  const bucket: FileStorage = {
    put: async (key, bytes) => {
      stored.set(key, bytes)
    },
    get: async (key) => {
      const bytes = stored.get(key)
      return bytes
        ? {
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(bytes)
                controller.close()
              }
            })
          }
        : null
    },
    delete: async (key) => {
      stored.delete(key)
    }
  }
  await withFileStorage(bucket, () => putFile("invoice.pdf", new Uint8Array([1])), "pr-42/")
  await withFileStorage(bucket, () => putFile("invoice.pdf", new Uint8Array([2])), "pr-420/")
  expect(await withFileStorage(bucket, () => getFile("invoice.pdf"), "pr-42/")).toEqual(new Uint8Array([1]))
  await withFileStorage(bucket, () => deleteFile("invoice.pdf"), "pr-42/")
  expect(await withFileStorage(bucket, () => getFile("invoice.pdf"), "pr-420/")).toEqual(new Uint8Array([2]))
  await expect(withFileStorage(bucket, () => getFile("invoice.pdf"), "pr-42/")).rejects.toThrow(
    "Document is unavailable"
  )
  expect(stored.get("invoice.pdf")).toEqual(new Uint8Array([0]))
  expect(await withFileStorage(bucket, () => getFile("invoice.pdf"))).toEqual(new Uint8Array([0]))
})
