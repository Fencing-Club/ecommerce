import { palletRules, validatePacking } from "@repo/copacker-packing-rules"
import { useMessages, useTranslations } from "use-intl"
import { FieldError } from "@/components/packing-fields"
import { usePalletIssueErrors } from "@/components/packing-issues"
import { expandCartonGroups } from "@/lib/carton-groups"
import { dataSetOrder, palletCartonSet } from "./data"
import { type ErrorRow, ErrorTable, simulatorHref } from "./error-table"
import { everyReceiver, usePalletExamples } from "./pallet-examples"

const palletCodes = new Set<string>(palletRules)

// Every pallet error validatePacking reports, by code: each example's issues, with the error as the pallet table shows
// it, under the field or row of the pallet it names, or below the pallets. Each row opens its example in the simulator.
// A new policy or rule adds its rows.
export function PalletCatalog() {
  const readiness = useTranslations("server.readiness.packing")
  const issueErrors = usePalletIssueErrors()
  const messages = useMessages()
  const examples = usePalletExamples()
  const rows = examples.flatMap((example): ErrorRow[] =>
    validatePacking(dataSetOrder(example.plenty, example.receiver), {
      cartons: expandCartonGroups(example.cartons ?? palletCartonSet),
      changes: [],
      palletized: true,
      pallets: example.pallets
    })
      .issues.filter((issue) => palletCodes.has(issue.code))
      .map((issue) => ({
        group: example.group,
        code: issue.code,
        rule: example.rule,
        checklist: example.checklist,
        error: issueErrors(
          [issue],
          example.pallets.find((candidate) => candidate.palletId === issue.palletId)
        ).map((error) => (
          <FieldError key={error.message} source={error.source}>
            {error.message}
          </FieldError>
        )),
        readiness: "values" in issue ? readiness(issue.code, issue.values) : readiness(issue.code),
        simulator: simulatorHref("simulators-pallet-validation--error-example", example.id)
      }))
  )
  const codes = Object.keys(messages.server.readiness.packing).filter((code) => palletCodes.has(code))
  const groups = [...new Set(rows.map((row) => row.group).filter((group) => group !== everyReceiver))].toSorted()
  return <ErrorTable title="Every pallet error" groups={[...groups, everyReceiver]} rows={rows} codes={codes} />
}
