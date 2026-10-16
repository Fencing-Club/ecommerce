import { checkServerIdentity } from "node:tls"
import type { ClientConfig } from "pg"
import invariant from "tiny-invariant"

// Node workers and administrative scripts share one verified direct connection policy. Workers use Hyperdrive.
export function directDatabase(): ClientConfig {
  invariant(process.env.DATABASE_URL, "DATABASE_URL is required")
  const url = new URL(process.env.DATABASE_URL)
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
  const ca = process.env.DATABASE_CA_CERT
  invariant(
    local || url.hostname.endsWith(".railway.internal") || ca,
    "Public database access requires DATABASE_CA_CERT"
  )
  const identity = process.env.DATABASE_TLS_SERVER_NAME || url.hostname
  for (const name of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
    url.searchParams.delete(name)
  }
  return {
    connectionString: url.href,
    connectionTimeoutMillis: 15_000,
    ssl: ca
      ? { ca, rejectUnauthorized: true, checkServerIdentity: (_host, cert) => checkServerIdentity(identity, cert) }
      : undefined
  }
}
