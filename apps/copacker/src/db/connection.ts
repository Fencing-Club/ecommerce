import type { PoolConfig } from "pg"

export function databaseConfig(purpose: "application" | "migration" = "application"): PoolConfig {
  const connectionString =
    purpose === "migration" ? process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL : process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured")
  }
  const url = new URL(connectionString)
  if (purpose === "migration" && url.hostname.includes("-pooler.")) {
    throw new Error("Migrations require DIRECT_DATABASE_URL with a non-pooled connection")
  }
  // Neon uses a publicly trusted certificate. Explicitly verify the hostname as well as the certificate chain.
  const isNeon = url.hostname.endsWith(".neon.tech")
  if (isNeon) {
    url.searchParams.set("sslmode", "verify-full")
    url.searchParams.delete("sslrootcert")
  }
  return {
    connectionString: url.toString(),
    max: purpose === "migration" ? 1 : 10,
    keepAlive: true,
    connectionTimeoutMillis: 15000,
    ssl:
      !isNeon && process.env.DATABASE_CA_CERT
        ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
        : undefined
  }
}
