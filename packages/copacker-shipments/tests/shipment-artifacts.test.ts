import { createHash } from "node:crypto"
import { crc32, deflateRawSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { artifactCrc32, inspectShipmentZip } from "../src/shipment-artifacts"

type ZipEntry = {
  name: string
  data?: string | Buffer
  /** 8 deflates the bytes, 0 stores them, and anything else is a method yauzl can't read. */
  method?: number
  /** The Unix file type and permissions, which unzip reads from the external attributes. 0 is a ZIP made on Windows. */
  mode?: number
  /** General purpose flags on top of the UTF-8 name flag every entry sets. */
  flags?: number
  /** Declare a checksum or expanded size other than the bytes' own. */
  crc?: number
  size?: number
  /** Declare a stored size other than the bytes' own, which only yauzl's own checks read. */
  storedSize?: number
}

/** Writes a ZIP byte by byte, so a test can declare whatever names, modes, sizes and checksums it needs. */
function zip(...entries: ZipEntry[]) {
  const locals: Buffer[] = [],
    headers: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? ""),
      method = entry.method ?? 8,
      stored = method === 8 ? deflateRawSync(data) : data,
      name = Buffer.from(entry.name),
      // Bit 11 marks the name as UTF-8; without it yauzl reads the name as code page 437.
      flags = 0x800 + (entry.flags ?? 0),
      checksum = entry.crc ?? crc32(data),
      size = entry.size ?? data.length,
      mode = entry.mode ?? (entry.name.endsWith("/") ? 0o40755 : 0o100644)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(entry.storedSize ?? stored.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(0x031e, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(flags, 8)
    header.writeUInt16LE(method, 10)
    header.writeUInt32LE(checksum, 16)
    header.writeUInt32LE(entry.storedSize ?? stored.length, 20)
    header.writeUInt32LE(size, 24)
    header.writeUInt16LE(name.length, 28)
    header.writeUInt32LE(mode * 0x10000, 38)
    header.writeUInt32LE(offset, 42)
    locals.push(local, name, stored)
    headers.push(header, name)
    offset += local.length + name.length + stored.length
  }
  const directory = Buffer.concat(headers),
    end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

// A PDF is only bytes here: nothing reads its text.
const label = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n")
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex")
// yauzl's own checks fail the whole ZIP; this package's checks on an entry fail it with one message, whatever the cause.
const invalid = "Invalid ZIP."
const failed = "ZIP failed path, integrity or expansion validation."

describe("computing a ZIP entry's CRC-32", () => {
  it("matches the standard check value and zlib's own", () => {
    expect(artifactCrc32(Buffer.from("123456789"))).toBe(0xcbf43926)
    expect(artifactCrc32(Buffer.alloc(0))).toBe(0)
    for (const data of [label, Buffer.alloc(1000, 0xff), Buffer.from("Carton 1 of 12 / ONT8")]) {
      expect(artifactCrc32(data)).toBe(crc32(data))
    }
  })
})

describe("reading a ZIP of shipment artifacts", () => {
  it("returns each file's name, bytes and SHA-256, in order, and leaves folders out", async () => {
    const manifest = Buffer.from("cartons,12\n")
    const files = await inspectShipmentZip(
      zip(
        { name: "labels/" },
        { name: "labels/FBA15ABCD-U000001.pdf", data: label },
        { name: "labels/Étiquettes.pdf", data: label, method: 0 },
        { name: "manifest.csv", data: manifest, mode: 0 }
      )
    )
    expect(files).toEqual([
      { name: "labels/FBA15ABCD-U000001.pdf", data: label, sha256: sha256(label) },
      { name: "labels/Étiquettes.pdf", data: label, sha256: sha256(label) },
      { name: "manifest.csv", data: manifest, sha256: sha256(manifest) }
    ])
  })

  it("accepts names that only begin like a Windows device", async () => {
    const names = ["console.pdf", "com10.pdf", "auxiliary/lpt0.pdf", "nullable.pdf"]
    const files = await inspectShipmentZip(zip(...names.map((name) => ({ name, data: label }))))
    expect(files.map((file) => file.name)).toEqual(names)
  })

  it("rejects bytes that aren't a ZIP, and a ZIP with no files", async () => {
    await expect(inspectShipmentZip(label)).rejects.toThrow(invalid)
    await expect(inspectShipmentZip(zip())).rejects.toThrow("ZIP contains no files.")
    await expect(inspectShipmentZip(zip({ name: "labels/" }))).rejects.toThrow("ZIP contains no files.")
  })
})

describe("refusing unsafe paths", () => {
  it.each([
    ["a parent folder", "../label.pdf"],
    ["a parent folder further in", "labels/../../label.pdf"],
    ["an absolute path", "/etc/label.pdf"],
    ["a drive letter", "C:/label.pdf"],
    ["a backslash", "labels\\label.pdf"]
  ])("fails the ZIP on %s, which yauzl refuses itself", async (_, name) => {
    await expect(inspectShipmentZip(zip({ name, data: label }))).rejects.toThrow(invalid)
  })

  it.each([
    ["a control character", "label\u0001.pdf"],
    ["a null character", "label\u0000.pdf"],
    ["a delete character", "label\u007f.pdf"],
    ["a colon", "labels/label:stream.pdf"],
    ["a character Windows forbids", "label?.pdf"],
    ["a pipe", "label|1.pdf"],
    ["an empty folder name", "labels//label.pdf"],
    ["a current folder", "./label.pdf"],
    ["a trailing dot", "label.pdf."],
    ["a trailing space", "labels /label.pdf"],
    ["a Windows device", "CON"],
    ["a Windows device with an extension", "labels/nul.pdf"],
    ["a numbered Windows device", "com1.pdf"],
    ["a numbered printer port", "LPT9.txt"],
    ["a name over 512 characters", `${"a".repeat(509)}.pdf`]
  ])("fails the ZIP on %s", async (_, name) => {
    await expect(inspectShipmentZip(zip({ name, data: label }))).rejects.toThrow(failed)
  })

  it("fails the ZIP on two paths that differ only in case or Unicode form", async () => {
    await expect(
      inspectShipmentZip(zip({ name: "Label.pdf", data: label }, { name: "label.PDF", data: label }))
    ).rejects.toThrow(failed)
    await expect(
      inspectShipmentZip(zip({ name: "\u00e9.pdf", data: label }, { name: "e\u0301.pdf", data: label }))
    ).rejects.toThrow(failed)
  })

  it("fails the ZIP when a file and a folder share a path", async () => {
    await expect(
      inspectShipmentZip(zip({ name: "labels", data: label }, { name: "labels/1.pdf", data: label }))
    ).rejects.toThrow(failed)
    await expect(
      inspectShipmentZip(zip({ name: "labels/1.pdf", data: label }, { name: "labels", data: label }))
    ).rejects.toThrow(failed)
    await expect(inspectShipmentZip(zip({ name: "labels/" }, { name: "labels/1.pdf", data: label }))).resolves.toEqual([
      { name: "labels/1.pdf", data: label, sha256: sha256(label) }
    ])
  })

  it("fails the ZIP on links, special files and mislabelled folders", async () => {
    await expect(inspectShipmentZip(zip({ name: "label.pdf", data: "/etc/passwd", mode: 0o120777 }))).rejects.toThrow(
      failed
    )
    await expect(inspectShipmentZip(zip({ name: "fifo", mode: 0o10644 }))).rejects.toThrow(failed)
    await expect(inspectShipmentZip(zip({ name: "labels", mode: 0o40755 }))).rejects.toThrow(failed)
    await expect(inspectShipmentZip(zip({ name: "labels/", mode: 0o100644 }))).rejects.toThrow(failed)
  })

  it("fails the ZIP on an encrypted entry", async () => {
    await expect(inspectShipmentZip(zip({ name: "label.pdf", data: label, flags: 1 }))).rejects.toThrow(failed)
  })
})

describe("enforcing size and entry limits", () => {
  it("refuses a download over the byte limit before reading it", async () => {
    const data = zip({ name: "label.pdf", data: label })
    await expect(inspectShipmentZip(data, { maxBytes: data.length - 1 })).rejects.toThrow("ZIP exceeds download limit.")
    await expect(inspectShipmentZip(data, { maxBytes: data.length })).resolves.toHaveLength(1)
  })

  it("fails the ZIP when its files declare more than the expanded limit together", async () => {
    const data = zip({ name: "1.pdf", data: label }, { name: "2.pdf", data: label })
    await expect(inspectShipmentZip(data, { maxExpandedBytes: label.length * 2 - 1 })).rejects.toThrow(failed)
    await expect(inspectShipmentZip(data, { maxExpandedBytes: label.length * 2 })).resolves.toHaveLength(2)
  })

  it("fails the ZIP when an entry inflates past the size it declares", async () => {
    await expect(inspectShipmentZip(zip({ name: "label.pdf", data: Buffer.alloc(4096), size: 16 }))).rejects.toThrow(
      failed
    )
  })

  it("fails the ZIP past the entry limit, counting folders", async () => {
    const data = zip({ name: "labels/" }, { name: "labels/1.pdf", data: label }, { name: "labels/2.pdf", data: label })
    await expect(inspectShipmentZip(data, { maxEntries: 2 })).rejects.toThrow(failed)
    await expect(inspectShipmentZip(data, { maxEntries: 3 })).resolves.toHaveLength(2)
  })

  it("fails the ZIP on a folder that claims to hold bytes", async () => {
    await expect(inspectShipmentZip(zip({ name: "labels/", size: 10 }))).rejects.toThrow(failed)
  })

  it("refuses limits outside what it allows", async () => {
    const data = zip({ name: "label.pdf", data: label })
    await expect(inspectShipmentZip(data, { maxEntries: 0 })).rejects.toThrow("Too small")
    await expect(inspectShipmentZip(data, { maxBytes: 256 * 1024 * 1024 })).rejects.toThrow("Too big")
  })
})

describe("checking each entry's integrity", () => {
  it("fails the ZIP when an entry's checksum doesn't match its bytes", async () => {
    const data = zip({ name: "1.pdf", data: label }, { name: "2.pdf", data: label, crc: crc32(label) + 1 })
    await expect(inspectShipmentZip(data)).rejects.toThrow(failed)
    await expect(inspectShipmentZip(zip({ name: "1.pdf", data: label, method: 0, crc: 0 }))).rejects.toThrow(failed)
  })

  it("fails the ZIP when an entry inflates to fewer bytes than it declares", async () => {
    await expect(inspectShipmentZip(zip({ name: "label.pdf", data: label, size: label.length + 1 }))).rejects.toThrow(
      failed
    )
  })

  it("fails the ZIP on a stored entry whose two sizes disagree", async () => {
    await expect(
      inspectShipmentZip(zip({ name: "label.pdf", data: label, method: 0, storedSize: label.length - 1 }))
    ).rejects.toThrow(invalid)
  })

  it("fails the ZIP on a compression method it can't read", async () => {
    await expect(inspectShipmentZip(zip({ name: "label.pdf", data: label, method: 12 }))).rejects.toThrow(failed)
  })
})

describe("stopping a slow inspection", () => {
  // Inflating 16 MB of zeros takes many trips through zlib's thread pool, so neither a 1 ms timeout nor an early abort
  // can find it already finished.
  const slow = zip({ name: "labels.pdf", data: Buffer.alloc(16 * 1024 * 1024) })

  it("times out", async () => {
    await expect(inspectShipmentZip(slow, { timeoutMs: 1 })).rejects.toThrow("ZIP inspection timed out.")
  })

  it("stops when the signal aborts, before or during reading", async () => {
    await expect(inspectShipmentZip(slow, {}, AbortSignal.abort())).rejects.toThrow("ZIP inspection interrupted.")
    const controller = new AbortController()
    const inspection = inspectShipmentZip(slow, {}, controller.signal)
    setTimeout(() => controller.abort(), 1)
    await expect(inspection).rejects.toThrow("ZIP inspection interrupted.")
  })
})
