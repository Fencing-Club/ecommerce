import { cn } from "@/lib/utils"

export type ErrorRow = { code: string; rule: string; error: string }

// Every error by code: the rule it breaks and the message people see. A code with a message but no example that
// produces it gets a row of its own, so a new rule without one stands out.
export function ErrorTable({ title, rows, codes }: { title: string; rows: ErrorRow[]; codes: string[] }) {
  const covered = new Set(rows.map((row) => row.code))
  const missing = codes.filter((code) => !covered.has(code)).map((code) => ({ code, rule: "", error: "" }))
  const sorted = [...rows, ...missing].toSorted((a, b) => a.code.localeCompare(b.code) || a.rule.localeCompare(b.rule))
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <table aria-label={title} className="w-full rounded-lg border bg-card text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Code</th>
            <th className="px-3 py-2 font-medium">Rule</th>
            <th className="px-3 py-2 font-medium">Error</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => {
            const absent = !covered.has(row.code)
            return (
              <tr key={`${row.code}-${index}`} className={cn("border-t align-top", absent && "bg-destructive/10")}>
                <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                <td className="px-3 py-2">{row.rule}</td>
                <td className={cn("px-3 py-2", absent && "text-destructive")}>
                  {absent ? "No example produces this code yet" : row.error}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
