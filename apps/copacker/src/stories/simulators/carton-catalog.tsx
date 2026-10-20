import { palletRules, validatePacking } from "@repo/copacker-packing-rules"
import { useMessages, useTranslations } from "use-intl"
import { FieldError } from "@/components/packing-fields"
import { useCartonIssueErrors, usePackingIssueText } from "@/components/packing-issues"
import { expandCartonGroups } from "@/lib/carton-groups"
import { everyReceiver, useCartonExamples } from "./carton-examples"
import { dataSetOrder } from "./data"
import { type ErrorRow, ErrorTable, simulatorHref } from "./error-table"

const palletCodes = new Set<string>(palletRules)

// Every carton error validatePacking reports, by code: each example's issues, with the error as the carton table shows
// it, under the carton's row, or below the table for the whole packing. Each row opens its example in the simulator. A
// new policy or rule adds its rows.
export function CartonCatalog() {
  const readiness = useTranslations("server.readiness.packing")
  const issueErrors = useCartonIssueErrors()
  const packingText = usePackingIssueText()
  const messages = useMessages()
  const examples = useCartonExamples()
  const rows = examples.flatMap((example): ErrorRow[] => {
    const order = dataSetOrder(example.plenty, example.receiver)
    const packing = { cartons: expandCartonGroups(example.cartons), changes: example.changes ?? [] }
    return validatePacking(order, packing).issues.map((issue) => {
      const row = example.cartons.find(
        (carton) => issue.cartonId && (carton.cartonIds ?? [carton.cartonId]).includes(issue.cartonId)
      )
      return {
        group: example.group,
        code: issue.code,
        rule: example.rule,
        checklist: example.checklist,
        error: row ? (
          issueErrors([issue], row, order.items).map((error) => (
            <FieldError key={error.message} source={error.source}>
              {error.message}
            </FieldError>
          ))
        ) : (
          <p className="text-sm text-destructive">{packingText(issue)}</p>
        ),
        readiness: "values" in issue ? readiness(issue.code, issue.values) : readiness(issue.code),
        simulator: simulatorHref("simulators-carton-validation--error-example", example.id)
      }
    })
  })
  // An example of a rule that holds everywhere may break a policy's rule too, which the policy's rows already show.
  const policyCodes = new Set(rows.filter((row) => row.group !== everyReceiver).map((row) => row.code))
  const shown = rows.filter((row) => row.group !== everyReceiver || !policyCodes.has(row.code))
  const codes = Object.keys(messages.server.readiness.packing).filter((code) => !palletCodes.has(code))
  const groups = [...new Set(rows.map((row) => row.group).filter((group) => group !== everyReceiver))].toSorted()
  return <ErrorTable title="Every carton error" groups={[...groups, everyReceiver]} rows={shown} codes={codes} />
}
