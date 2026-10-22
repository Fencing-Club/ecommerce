import { useSetState } from "@mantine/hooks"
import { useState } from "react"

// Maps compare by their entries in key order, so the same entries set in another order still match.
function snapshot(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) =>
    item instanceof Map ? [...item].toSorted(([a], [b]) => String(a).localeCompare(String(b))) : item
  )
}

// A form's unsaved changes beside what's saved, like Shopify's editors. `change` merges fields into the draft, from an
// object or from the current draft; `dirty` says whether it differs from what's saved (Maps by their entries);
// `reset` discards the changes, and `markSaved` makes the draft, or the value sent, what's saved.
export function useDraft<T extends Record<string, unknown>>(initial: T | (() => T)) {
  const [saved, setSaved] = useState(initial)
  const [draft, change] = useSetState(saved)
  return {
    draft,
    saved,
    change,
    dirty: snapshot(draft) !== snapshot(saved),
    reset: () => change(saved),
    markSaved: (value: T = draft) => setSaved(value)
  }
}
