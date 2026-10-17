import { afterEach, describe, expect, it, vi } from "vitest"

const connections = vi.hoisted((): { opened: Array<{ end: () => Promise<void>; on: () => void }> } => ({ opened: [] }))
vi.mock("pg", () => ({
  Pool: class {
    end = vi.fn<() => Promise<void>>(async () => undefined)
    on = vi.fn<() => void>()
    constructor() {
      connections.opened.push(this)
    }
  }
}))
import { db, withDatabase } from "../src/db"

afterEach(() => {
  connections.opened.length = 0
})

describe("invocation-scoped database access", () => {
  it("keeps overlapping asynchronous requests isolated and closes both pools", async () => {
    const ready = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const first = withDatabase({}, async () => {
      const own = db()
      ready.resolve()
      await finish.promise
      expect(db()).toBe(own)
      return own
    })
    await ready.promise
    const second = await withDatabase({}, async () => {
      const own = db()
      await Promise.resolve()
      expect(db()).toBe(own)
      finish.resolve()
      return own
    })
    expect(await first).not.toBe(second)
    expect(connections.opened).toHaveLength(2)
    for (const connection of connections.opened) {
      expect(connection.end).toHaveBeenCalledOnce()
    }
  })

  it("closes the pool when the request fails", async () => {
    await expect(
      withDatabase({}, async () => {
        throw new Error("request failed")
      })
    ).rejects.toThrow("request failed")
    expect(connections.opened[0]?.end).toHaveBeenCalledOnce()
  })
})
