export type RecoveryState = {
  attempts: number
  status: "pending" | "resolved" | "unresolved" | "exhausted"
  nextAttemptAt: string
  anchor: string | null
  searched: string[]
  outcome: string
  reconciliation?: { checkedAt: string; blockers: string[] }
}

// Six months around the saved reference, never the entire account history. The original
// anchor is retained between runs so newly found rows cannot move the search indefinitely.
export function recoveryWindows(anchor: string, now: Date, ledger: boolean) {
  const date = new Date(anchor)
  if (!Number.isFinite(date.getTime())) {
    return []
  }
  const earliest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (ledger ? 17 : 23), 1))
  const windows = []
  for (let offset = 0; offset < 6; offset++) {
    const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - offset, 1))
    const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - offset + 1, 1))
    if (from >= earliest && to <= now) {
      windows.push({ from, to })
    }
  }
  return windows
}

export function recoveryDue(state: RecoveryState | undefined, now: Date, limit: number) {
  return (
    !state ||
    (state.status !== "exhausted" &&
      state.status !== "resolved" &&
      state.attempts < limit &&
      Date.parse(state.nextAttemptAt) <= now.getTime())
  )
}
