import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual, createHmac } from "node:crypto"
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}
export function token() {
  return randomBytes(32).toString("base64url")
}
function encryptionKey() {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64")
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must contain 32 random bytes in base64")
  }
  return key
}
export function encrypt(value: string, scope: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  cipher.setAAD(Buffer.from(scope))
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64")
}
export function decrypt(value: string, scope: string) {
  const raw = Buffer.from(value, "base64"),
    decipher = createDecipheriv("aes-256-gcm", encryptionKey(), raw.subarray(0, 12))
  decipher.setAAD(Buffer.from(scope))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
}
export function verifyShopifyHmac(params: URLSearchParams, secret: string) {
  const provided = params.get("hmac") ?? ""
  if (!/^[a-f0-9]{64}$/.test(provided)) {
    return false
  }
  const entries = [...params]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
  const message = entries.map(([key, value]) => `${key}=${value}`).join("&")
  return timingSafeEqual(Buffer.from(provided, "hex"), createHmac("sha256", secret).update(message).digest())
}
export function appUrl() {
  const value = process.env.APP_URL ?? "http://localhost:3000"
  return new URL(value).origin
}
// Where to send someone after sign-in: a page on this app, never another origin or an auth route that would loop.
export function returnPath(value: string | null | undefined, fallback = "/orders") {
  // Browsers read a backslash as a slash, so "/\host" could leave the app; such paths are never ours.
  if (!value || /[\\\p{Cc}]/u.test(value) || !URL.canParse(value, "http://app.invalid")) {
    return fallback
  }
  const url = new URL(value, "http://app.invalid")
  const local = value.startsWith("/") && !value.startsWith("//") && url.origin === "http://app.invalid"
  const path = `${url.pathname}${url.search}`
  if (!local || /^\/(login|logout|callback|api)(\/|$)/.test(url.pathname)) {
    return fallback
  }
  return path
}
