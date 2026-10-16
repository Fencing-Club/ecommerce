import { afterEach, describe, expect, it, vi } from "vitest"
import { databaseConfig } from "../src/db/connection"

describe("db", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("survives an idle connection being terminated", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@127.0.0.1:1/copacker")
    const { db } = await import("../src/db")
    const pool = db().$client
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    // Without a listener, emitting 'error' on the pool throws, which is what crashed the worker.
    expect(() => pool.emit("error", new Error("Connection terminated unexpectedly"))).not.toThrow()
    expect(logged).toHaveBeenCalledOnce()
  })

  it("uses the direct endpoint for migrations and the pooler for application traffic", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@ep-example-pooler.us-west-2.aws.neon.tech/neondb")
    vi.stubEnv("DIRECT_DATABASE_URL", "postgres://user:pass@ep-example.us-west-2.aws.neon.tech/neondb")
    expect(new URL(databaseConfig().connectionString!).hostname).toContain("-pooler.")
    expect(new URL(databaseConfig("migration").connectionString!).hostname).not.toContain("-pooler.")
    expect(databaseConfig("migration").max).toBe(1)
  })

  it("rejects migrations through a pooler when the direct URL is missing", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@ep-example-pooler.us-west-2.aws.neon.tech/neondb")
    vi.stubEnv("DIRECT_DATABASE_URL", "")
    expect(() => databaseConfig("migration")).toThrow("DIRECT_DATABASE_URL")
  })

  it("verifies Neon certificates without inheriting the Railway CA", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@ep-example.us-west-2.aws.neon.tech/neondb?sslmode=require")
    vi.stubEnv("DATABASE_CA_CERT", "old Railway certificate")
    expect(new URL(databaseConfig().connectionString!).searchParams.get("sslmode")).toBe("verify-full")
    expect(databaseConfig().ssl).toBeUndefined()
  })

  it("keeps local Docker migrations working without a second URL", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost/copacker")
    vi.stubEnv("DIRECT_DATABASE_URL", "")
    expect(databaseConfig("migration").connectionString).toBe("postgres://user:pass@localhost/copacker")
  })
})
