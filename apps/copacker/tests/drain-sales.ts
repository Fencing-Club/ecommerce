import { and, eq } from "drizzle-orm"
import { db } from "../src/db/index"
import { jobs } from "../src/db/schema"
import { runNextJob } from "../src/server/queue"

// Advance committed progress checkpoints without sleeping. Real provider backoff stays pending for assertions.
export async function drainSales() {
  for (let attempt = 0; attempt < 200; attempt++) {
    await runNextJob()
    const resumed = await db()
      .update(jobs)
      .set({ runAt: new Date(0) })
      .where(and(eq(jobs.kind, "sales"), eq(jobs.status, "pending"), eq(jobs.error, "Sales import checkpoint saved")))
      .returning({ id: jobs.id })
    if (!resumed.length) {
      return
    }
  }
  throw new Error("Sales fixture exceeded its checkpoint budget")
}
