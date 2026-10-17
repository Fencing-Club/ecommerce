import { jobSignal } from "./job-delivery"

// One bounded SQL attempt per delivery. SQL owns retries and payloads; Queues only carries wake signals.
export async function consumeJobSignal(
  body: unknown,
  dependencies: {
    runNext: () => Promise<boolean>
    nextDelay: () => Promise<number | null>
    signal: (delay: number) => Promise<void>
  }
) {
  const signal = jobSignal.parse(typeof body === "string" ? JSON.parse(body) : body)
  if (signal.kind !== "wake") {
    throw new Error("The Cloudflare executor accepts wake signals only")
  }
  await dependencies.runNext()
  const delay = await dependencies.nextDelay()
  if (delay !== null) {
    await dependencies.signal(Math.min(86400, Math.max(5, delay)))
  }
}
