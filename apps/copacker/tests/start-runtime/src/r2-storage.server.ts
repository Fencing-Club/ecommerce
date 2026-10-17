import type { FileStorage } from "@/server/storage"

// Use the native binding in Workers. The Node job runner keeps the S3 transport behind the same storage operations.
export function r2Storage(bucket: R2Bucket): FileStorage {
  return {
    async put(key, bytes, contentType) {
      await bucket.put(key, bytes, { httpMetadata: { contentType } })
    },
    async get(key) {
      const object = await bucket.get(key)
      return object && { body: object.body, size: object.size, contentType: object.httpMetadata?.contentType }
    },
    delete: (key) => bucket.delete(key)
  }
}
