import { palletRules, validatePacking } from "@repo/copacker-packing-rules"
import { palletPolicies } from "@repo/copacker-packing-rules/pallet-policies"
import { useState } from "react"
import { PalletTable } from "@/components/pallet-table"
import { expandCartonGroups, palletCartons, type PalletValue } from "@/lib/carton-groups"
import {
  dataSetOrder,
  palletCartonSet,
  type PalletDataSet,
  palletDataSets,
  type Receiver,
  receiverNames,
  receivers
} from "./data"
import { usePalletExamples } from "./pallet-examples"
import { IssueReport, palletCodes, PolicyRules, Setting } from "./simulator-parts"

// The pallet table as the packing page runs it: twelve cartons packed on pallets, and every edit goes through
// validatePacking from @repo/aisle, with its pallet issues in the table and in full below it. Its data sets are the ones
// here and an example of every error, which Every pallet error links to by ID.
export function PalletSimulator({ dataSet: initial }: { dataSet: string }) {
  const examples = usePalletExamples()
  const dataSets: Record<string, PalletDataSet> = {
    ...palletDataSets,
    ...Object.fromEntries(examples.map((example) => [example.id, example]))
  }
  const [dataSet, setDataSet] = useState(dataSets[initial] ? initial : "withinLimits")
  const chosen = dataSets[dataSet] ?? palletDataSets.withinLimits
  const [receiver, setReceiver] = useState<Receiver>(chosen.receiver)
  const [pallets, setPallets] = useState<PalletValue[]>(chosen.pallets)
  const order = dataSetOrder(chosen.plenty, receiver)
  const cartons = chosen.cartons ?? palletCartonSet
  const issues = validatePacking(order, {
    cartons: expandCartonGroups(cartons),
    changes: [],
    palletized: true,
    pallets
  }).issues
  const policy = receiver === "fba" || receiver === "awd_us" ? palletPolicies[receiver] : undefined
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">Pallet validation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The real pallet rules: edit any pallet, or pick another data set or receiver, and validatePacking checks
            them again. Cartons A1–A12 are packed on the pallets.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Setting
            label="Data set"
            value={dataSet}
            options={Object.entries(dataSets).map(([key, set]) => ({ value: key, label: set.name }))}
            onChange={(key) => {
              setDataSet(key)
              setReceiver(dataSets[key]!.receiver)
              setPallets(dataSets[key]!.pallets)
            }}
          />
          <Setting
            label="Receiver"
            value={receiver}
            options={receivers
              .filter((value) => value !== "mixed")
              .map((value) => ({ value, label: receiverNames[value] }))}
            onChange={setReceiver}
          />
        </div>
        <p className="text-sm">{chosen.note}</p>
      </header>
      <PolicyRules title="Pallet policy" receiver={policy?.receiver} rules={policy?.rules} />
      <PalletTable
        pallets={pallets}
        cartons={palletCartons(cartons, order.items)}
        issues={issues.filter((issue) => palletRules.has(issue.code))}
        context="PO39 / Simulator"
        showErrors
        onChange={setPallets}
      />
      <IssueReport issues={issues} codes={palletCodes} products={order.items} />
    </div>
  )
}
