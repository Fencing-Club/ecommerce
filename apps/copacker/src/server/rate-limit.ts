// Counts requests per key over a sliding window, in this server's memory. It slows one person down; it isn't a
// guarantee across servers or restarts. Returns whether the request just counted is one too many.
export function rateLimit({ period, allowed }: { period: number; allowed: number }) {
  const recent = new Map<string, number[]>()
  return (key: string) => {
    const now = Date.now()
    if (recent.size > 5000) {
      for (const [other, times] of recent) {
        if (times.every((time) => now - time >= period)) {
          recent.delete(other)
        }
      }
    }
    const times = (recent.get(key) ?? []).filter((time) => now - time < period)
    times.push(now)
    recent.set(key, times)
    return times.length > allowed
  }
}

// The address a request came from, as the proxy in front of the app reports it.
export function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
}
