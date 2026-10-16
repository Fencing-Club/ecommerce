import { afterEach, describe, expect, it, vi } from "vitest"

describe("db", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("survives an idle connection being terminated", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@127.0.0.1:1/copacker")
    const { db } = await import("../src/db")
    const database = db()
    if (!("$client" in database)) {
      throw new Error("Expected the Node pool")
    }
    const pool = database.$client
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    // Without a listener, emitting 'error' on the pool throws, which is what crashed the worker.
    expect(() => pool.emit("error", new Error("Connection terminated unexpectedly"))).not.toThrow()
    expect(logged).toHaveBeenCalledOnce()
  })
})
