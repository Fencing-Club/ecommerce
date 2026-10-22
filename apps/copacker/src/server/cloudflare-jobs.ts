import { jobSignal } from "./job-delivery"
import { readNotifications } from "./notification-reader"
import { nextJobDelay, runNextJob, type JobClaim } from "./queue"
import { queueReconciliation } from "./reconcile"

// The calls this module makes on the Worker's queue and Workflow bindings. It's also tested in Node, which doesn't load
// the Workers types, so they're spelled out here.
type SignalQueue = {
  send: (body: string, options: { contentType: "text"; delaySeconds: number }) => Promise<unknown>
}
type JobWorkflows = {
  create: (options: { id: string; params: JobClaim }) => Promise<unknown>
  get: (id: string) => Promise<{ status: () => Promise<unknown> }>
}

// Publishes a wake signal: once the delay has passed, the executor runs the next job that's due.
export async function wakeSignal(queue: SignalQueue, delaySeconds: number) {
  await queue.send(JSON.stringify({ kind: "wake" }), { contentType: "text", delaySeconds })
}

// Wakes the executor when the next job is due, if one is waiting, and no sooner than `minimumSeconds`.
export async function wakeForNextJob(queue: SignalQueue, minimumSeconds: number) {
  const delay = await nextJobDelay()
  if (delay !== null) {
    await wakeSignal(queue, Math.min(86400, Math.max(minimumSeconds, delay)))
  }
}

// The executor queue's handler. SQL owns retries and payloads; the queue only carries signals:
// - A wake, or the daily reconcile signal, makes one bounded SQL attempt: a short job runs here, and a long one starts
//   its Workflow. Then it wakes the executor for the next due job, at least five seconds later, so running slots that
//   are all taken aren't polled busily.
// - A notifications signal reads one batch from the provider's AWS queue, and reads again a second later when the batch
//   was full.
// Each message is acknowledged only after its work and its next signal, so a failure leaves it to the queue's retries.
export async function consumeJobSignals(
  messages: readonly { body: unknown; ack: () => void }[],
  { queue, workflow }: { queue: SignalQueue; workflow?: JobWorkflows }
) {
  for (const message of messages) {
    const signal = jobSignal.parse(typeof message.body === "string" ? JSON.parse(message.body) : message.body)
    if (signal.kind === "notifications") {
      // A read takes at most ten messages.
      if ((await readNotifications(signal.provider)) === 10) {
        await queue.send(JSON.stringify(signal), { contentType: "text", delaySeconds: 1 })
      }
    } else {
      if (signal.kind === "reconcile") {
        await queueReconciliation()
      }
      await runNextJob("cloudflare", (claim) => startWorkflow(workflow, claim))
      await wakeForNextJob(queue, 5)
    }
    message.ack()
  }
}

// Starts the Workflow that runs a long job's claim. Its ID names the claim, so a create that's repeated after a lost
// response finds the same instance.
async function startWorkflow(workflow: JobWorkflows | undefined, claim: JobClaim) {
  if (!workflow) {
    throw new Error("Job Workflow binding is missing")
  }
  const id = `${claim.id}-${Date.parse(claim.leaseAt)}`
  try {
    await workflow.create({ id, params: claim })
  } catch (error) {
    // A create response may have been lost. Only suppress it when the same instance exists.
    try {
      await (await workflow.get(id)).status()
    } catch {
      throw error
    }
  }
}
