import { Fragment } from "react"

// One error: whose rule it is, the code, the rule as @repo/copacker-packing-rules describes it and the supplier's checklist states
// it, the error as the editor shows it, the line readiness checks show, and a link to the simulator with its example
// loaded.
export type ErrorRow = {
  group: string
  code: string
  rule: string
  checklist?: string
  error: React.ReactNode
  readiness: string
  simulator: string
}

// A simulator story with a data set loaded, linked from inside Storybook's preview frame, which opens it in the whole
// window. Storybook takes a story's args from its URL.
export function simulatorHref(story: string, dataSet: string) {
  return `./?path=/story/${story}&args=dataSet:${dataSet}`
}

// Every error grouped by whose rule it is, then by rule. The groups come in the order given; a code with a message but
// no example that produces it gets a row of its own at the end, so a new rule without one stands out.
export function ErrorTable({
  title,
  groups,
  rows,
  codes
}: {
  title: string
  groups: string[]
  rows: ErrorRow[]
  codes: string[]
}) {
  const covered = new Set(rows.map((row) => row.code))
  const missing = codes.filter((code) => !covered.has(code))
  const sections = groups
    .map((group) => ({
      group,
      rows: rows
        .filter((row) => row.group === group)
        .toSorted((a, b) => a.rule.localeCompare(b.rule) || a.code.localeCompare(b.code))
    }))
    .filter((section) => section.rows.length > 0)
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <table aria-label={title} className="w-full rounded-lg border bg-card text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Code</th>
            <th className="px-3 py-2 font-medium">Rule</th>
            <th className="px-3 py-2 font-medium">Error</th>
            <th className="px-3 py-2 font-medium">Readiness check</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <Fragment key={section.group}>
              <tr className="border-t bg-muted/50">
                <th colSpan={4} scope="rowgroup" className="px-3 py-2 font-semibold">
                  {section.group}
                </th>
              </tr>
              {section.rows.map((row, index) => (
                <tr key={`${row.code}-${index}`} className="border-t align-top">
                  <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                  <td className="px-3 py-2">
                    <p>{row.rule}</p>
                    {row.checklist && <p className="mt-1 text-xs text-muted-foreground">Checklist: {row.checklist}</p>}
                  </td>
                  <td className="px-3 py-2">{row.error}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <p>{row.readiness}</p>
                    <a
                      href={row.simulator}
                      target="_top"
                      className="mt-1 inline-block text-foreground underline underline-offset-4"
                    >
                      Open in simulator
                    </a>
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
          {missing.map((code) => (
            <tr key={code} className="border-t bg-destructive/10 align-top">
              <td className="px-3 py-2 font-mono text-xs">{code}</td>
              <td colSpan={3} className="px-3 py-2 text-destructive">
                No example produces this code yet
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
