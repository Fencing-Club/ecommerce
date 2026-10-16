import type { AmazonShipment } from "./amazon-shipments"

// Cache completed values only: an isolate must never share a pending request's provider I/O. The caller checks the
// current connection on every read and includes its generation in the key, so disconnects/reconnects take effect now.
export function amazonShipmentCache() {
  const snapshots = new Map<string, { rows: AmazonShipment[]; expires: number; sequence: number }>()
  let sequence = 0
  return async (key: string, load: () => Promise<AmazonShipment[]>) => {
    const cached = snapshots.get(key)
    if (cached && cached.expires > Date.now()) {
      return structuredClone(cached.rows)
    }
    const attempt = ++sequence
    const rows = await load()
    if ((snapshots.get(key)?.sequence ?? 0) < attempt) {
      for (const [oldKey, snapshot] of snapshots) {
        if (snapshot.expires <= Date.now()) {
          snapshots.delete(oldKey)
        }
      }
      snapshots.delete(key)
      if (snapshots.size >= 20) {
        const oldest = snapshots.keys().next().value
        if (oldest !== undefined) {
          snapshots.delete(oldest)
        }
      }
      snapshots.set(key, { rows: structuredClone(rows), expires: Date.now() + 60_000, sequence: attempt })
    }
    return rows
  }
}
