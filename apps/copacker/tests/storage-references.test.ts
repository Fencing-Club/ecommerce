import { randomUUID } from "node:crypto"
import { expect, it } from "vitest"
import { organizations, supplierProductGroups } from "../src/db/schema"
import { storageReferenceQuery } from "../src/db/storage-references"
import { database, pg, setUpTestDatabase } from "./test-db"

setUpTestDatabase()

it("inventories product photos from the migrated database without duplicating shared object keys", async () => {
  const supplierOrgId = randomUUID()
  await database.insert(organizations).values({ id: supplierOrgId, name: "Storage test", kind: "supplier" })
  await database.insert(supplierProductGroups).values([
    { supplierOrgId, title: "One", images: [{ key: "photo/shared", name: "photo.png", contentType: "image/png" }] },
    { supplierOrgId, title: "Two", images: [{ key: "photo/shared", name: "photo.png", contentType: "image/png" }] }
  ])
  const result = await pg.query(storageReferenceQuery)
  expect(result.rows).toEqual([{ key: "photo/shared" }])
})
