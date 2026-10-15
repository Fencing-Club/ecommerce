// A signal drains available work, schedules the next due retry, and then returns. There is no idle database loop.
export async function drainPendingJobs(options: {
  runNext: () => Promise<boolean>
  nextDelay: () => Promise<number | null>
  signal: (delay: number) => Promise<void>
  stopped: () => boolean
}) {
  const results = await Promise.allSettled(
    Array.from({ length: 3 }, async () => {
      while (!options.stopped() && (await options.runNext())) {
        // The database's row locks and leases arbitrate concurrent claims.
      }
    })
  )
  // Wait for the other lanes before retrying a failed batch, so an outage cannot accumulate concurrent handlers.
  const failed = results.find((result) => result.status === "rejected")
  if (failed?.status === "rejected") {
    throw failed.reason
  }
  const delay = await options.nextDelay()
  if (delay !== null) {
    await options.signal(delay)
  }
}
