import { checkServerIdentity } from "node:tls"
import type { PoolConfig } from "pg"
import invariant from "tiny-invariant"

// Node services and administrative tools share verified connection policy. The web Worker uses Hyperdrive.
export function databaseConfig(
  purpose: "application" | "migration" = "application",
  environment = process.env
): PoolConfig {
  const connectionString =
    purpose === "migration" ? environment.DIRECT_DATABASE_URL || environment.DATABASE_URL : environment.DATABASE_URL
  invariant(connectionString, "DATABASE_URL is not configured")
  const url = new URL(connectionString)
  if (purpose === "migration" && url.hostname.includes("-pooler.")) {
    throw new Error("Migrations require DIRECT_DATABASE_URL with a non-pooled connection")
  }
  const isNeon = url.hostname.endsWith(".neon.tech")
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
  const ca = environment.DATABASE_CA_CERT
  invariant(
    isNeon || local || url.hostname.endsWith(".railway.internal") || ca,
    "Public database access requires DATABASE_CA_CERT"
  )
  // Strip URL TLS options that would override our verified configuration. Neon uses its public CA and hostname.
  for (const name of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
    url.searchParams.delete(name)
  }
  if (isNeon) {
    url.searchParams.set("sslmode", "verify-full")
  }
  const identity = environment.DATABASE_TLS_SERVER_NAME || url.hostname
  return {
    connectionString: url.href,
    max: purpose === "migration" ? 1 : 10,
    keepAlive: true,
    connectionTimeoutMillis: 15_000,
    ssl:
      !isNeon && ca
        ? { ca, rejectUnauthorized: true, checkServerIdentity: (_host, cert) => checkServerIdentity(identity, cert) }
        : undefined
  }
}
