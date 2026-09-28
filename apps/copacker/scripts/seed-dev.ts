// Fills the local (or staging) database with a demo Shopify store for every buyer workspace, so Inventory, POs and Restock can be
// tried without connecting real accounts. Refuses to run against anything but a local or staging database.
// Usage: pnpm db:seed (after signing in locally once, so a workspace exists).
import { eq } from "drizzle-orm"
import { db } from "../src/db/index"
import { organizations } from "../src/db/schema"
import { requireDemoDatabase, seedDemoStore } from "./demo-store"

requireDemoDatabase()
const buyers = await db().select().from(organizations).where(eq(organizations.kind, "buyer"))
if (!buyers.length) {
  throw new Error("Sign in locally first so a buyer workspace exists")
}
for (const org of buyers) {
  process.stdout.write(
    (await seedDemoStore(org)) ? `Seeded ${org.name}\n` : `Skipped ${org.name}: it has a real store\n`
  )
}
process.exit(0)
