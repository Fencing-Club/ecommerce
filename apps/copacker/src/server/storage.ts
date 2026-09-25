import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { PDFDocument, PDFDict, PDFName } from "pdf-lib"
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
    throw new Error("Upload a PDF smaller than 32 MB")
  }
  const doc = await PDFDocument.load(bytes)
  if (doc.getPageCount() < 1 || doc.getPageCount() > 1000) {
    throw new Error("PDF must have 1 to 1,000 pages")
  }
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (
      object instanceof PDFDict &&
      ["JavaScript", "JS", "Launch", "EmbeddedFiles", "OpenAction", "AA"].some((name) => object.has(PDFName.of(name)))
    ) {
      throw new Error("PDF contains active content. Export a print-only PDF before uploading")
    }
  }
}
export async function putFile(key: string, bytes: Uint8Array, contentType = "application/pdf") {
  const { client, bucket } = storage()
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }))
}
export async function getFile(key: string) {
  const { client, bucket } = storage()
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!result.Body) {
    throw new Error("Document is unavailable")
  }
  return result.Body.transformToByteArray()
}
