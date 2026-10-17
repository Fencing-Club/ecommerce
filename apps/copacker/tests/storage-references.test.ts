import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { expect, it } from "vitest"
import { organizations, supplierProductGroups } from "../src/db/schema"
import { storageReferenceQuery } from "../src/db/storage-references"
import { applyMigrations } from "./migrations"

it("inventories product photos from the migrated database without duplicating shared object keys", async () => {
  const client = new PGlite()
  try {
    await applyMigrations(client)
    const database = drizzle(client)
    const supplierOrgId = randomUUID()
    await database.insert(organizations).values({ id: supplierOrgId, name: "Storage test", kind: "supplier" })
    await database.insert(supplierProductGroups).values([
      { supplierOrgId, title: "One", images: [{ key: "photo/shared", name: "photo.png", contentType: "image/png" }] },
      { supplierOrgId, title: "Two", images: [{ key: "photo/shared", name: "photo.png", contentType: "image/png" }] }
    ])
    const result = await client.query(storageReferenceQuery)
    expect(result.rows).toEqual([{ key: "photo/shared" }])
  } finally {
    await client.close()
  }
})
