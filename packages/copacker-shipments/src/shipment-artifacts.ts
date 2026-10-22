/* eslint-disable no-bitwise, no-control-regex -- ZIP integrity and path validation require byte masks and control-character checks. */
import { createHash } from "node:crypto"
import { fromBuffer, type ZipFile, type Entry } from "yauzl"
import { z } from "zod"

const limitsSchema = z.strictObject({
  maxBytes: z
    .number()
    .int()
    .min(1)
    .max(128 * 1024 * 1024)
    .default(32 * 1024 * 1024),
  maxExpandedBytes: z
    .number()
    .int()
    .min(1)
    .max(256 * 1024 * 1024)
    .default(128 * 1024 * 1024),
  maxEntries: z.number().int().min(1).max(10000).default(2000),
  timeoutMs: z.number().int().min(1).max(120000).default(30000)
})
type Limits = z.input<typeof limitsSchema>
export function artifactCrc32(data: Buffer) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
function safeName(name: string) {
  if (name.length > 512 || name.includes("\\") || /[\x00-\x1f\x7f:<>"|?*]/.test(name) || name.startsWith("/")) {
    throw new Error("Unsafe ZIP path.")
  }
  const parts = name.replace(/\/$/, "").split("/")
  if (
    parts.some(
      (p) => !p || p === "." || p === ".." || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)
    )
  ) {
    throw new Error("Unsafe ZIP path.")
  }
  return parts.join("/")
}
/** Return verified entry bytes; caller assigns carton identity. Never extract to provider-supplied paths. */
export async function inspectShipmentZip(data: Buffer, options: Limits = {}, signal?: AbortSignal) {
  const limits = limitsSchema.parse(options)
  if (data.length > limits.maxBytes) {
    throw new Error("ZIP exceeds download limit.")
  }
  const zip = await new Promise<ZipFile>((accept, reject) =>
    fromBuffer(data, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, value) =>
      error ? reject(new Error("Invalid ZIP.")) : accept(value!)
    )
  )
  return await new Promise<Array<{ name: string; data: Buffer; sha256: string }>>((accept, reject) => {
    let count = 0,
      total = 0,
      finished = false,
      active: import("node:stream").Readable | undefined
    const files: Array<{ name: string; data: Buffer; sha256: string }> = [],
      names = new Map<string, boolean>()
    const finish = (error?: Error) => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", aborted)
      active?.destroy()
      zip.close()
      if (error) {
        reject(error)
      } else {
        accept(files)
      }
    }
    const aborted = () => finish(new Error("ZIP inspection interrupted."))
    const timer = setTimeout(() => finish(new Error("ZIP inspection timed out.")), limits.timeoutMs)
    signal?.addEventListener("abort", aborted, { once: true })
    zip.on("error", () => finish(new Error("Invalid ZIP.")))
    zip.on("end", () => (files.length ? finish() : finish(new Error("ZIP contains no files."))))
    zip.on("entry", (entry: Entry) => {
      void (async () => {
        if (finished) {
          return
        }
        if (++count > limits.maxEntries) {
          throw new Error("ZIP entry limit exceeded.")
        }
        const name = safeName(entry.fileName),
          key = name.normalize("NFC").toLowerCase(),
          directory = entry.fileName.endsWith("/")
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000
        if (
          (mode !== 0 && mode !== 0x8000 && mode !== 0x4000) ||
          (mode === 0x4000 && !directory) ||
          (mode === 0x8000 && directory)
        ) {
          throw new Error("ZIP links and special files are not supported.")
        }
        if (entry.generalPurposeBitFlag & 1) {
          throw new Error("Encrypted ZIP is not supported.")
        }
        if (
          names.has(key) ||
          [...names].some(([n, dir]) => (key.startsWith(n + "/") && !dir) || (n.startsWith(key + "/") && !directory))
        ) {
          throw new Error("ZIP contains duplicate or conflicting paths.")
        }
        names.set(key, directory)
        total += entry.uncompressedSize
        if (!Number.isSafeInteger(total) || total > limits.maxExpandedBytes) {
          throw new Error("ZIP expansion limit exceeded.")
        }
        if (directory) {
          if (entry.uncompressedSize !== 0) {
            throw new Error("Invalid ZIP directory.")
          }
          zip.readEntry()
          return
        }
        const stream = await new Promise<import("node:stream").Readable>((accept, reject) =>
          zip.openReadStream(entry, (error, value) =>
            error ? reject(new Error("Invalid ZIP entry.")) : accept(value!)
          )
        )
        active = stream
        if (finished) {
          stream.destroy()
          return
        }
        const stop = () => stream.destroy(new Error("ZIP inspection interrupted."))
        signal?.addEventListener("abort", stop, { once: true })
        const chunks: Buffer[] = []
        let bytes = 0
        try {
          for await (const raw of stream) {
            if (finished) {
              throw new Error("ZIP inspection interrupted.")
            }
            const chunk = Buffer.from(raw)
            bytes += chunk.length
            if (bytes > entry.uncompressedSize || bytes > limits.maxExpandedBytes) {
              throw new Error("ZIP expansion limit exceeded.")
            }
            chunks.push(chunk)
          }
        } finally {
          signal?.removeEventListener("abort", stop)
          stream.destroy()
        }
        const content = Buffer.concat(chunks)
        if (bytes !== entry.uncompressedSize || artifactCrc32(content) !== entry.crc32) {
          throw new Error("ZIP entry checksum or size mismatch.")
        }
        files.push({ name, data: content, sha256: createHash("sha256").update(content).digest("hex") })
        zip.readEntry()
      })().catch(() => finish(new Error("ZIP failed path, integrity or expansion validation.")))
    })
    if (signal?.aborted) {
      aborted()
    } else {
      zip.readEntry()
    }
  })
}
