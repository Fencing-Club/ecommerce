import { palletRules, validatePacking } from "@repo/aisle"
import { palletPolicies } from "@repo/aisle/pallet-policies"
import { useState } from "react"
import { PalletTable } from "@/components/pallet-table"
import { expandCartonGroups, palletCartons, type PalletValue } from "@/lib/carton-groups"
import { palletCartonSet, palletDataSets, type Receiver, receiverNames, receivers, simulatorOrder } from "./data"
import { IssueReport, palletCodes, PolicyRules, Setting } from "./simulator-parts"

type DataSetKey = keyof typeof palletDataSets

// The pallet table as the packing page runs it: twelve cartons packed on pallets, and every edit goes through
// validatePacking from @repo/aisle, with its pallet issues in the table and in full below it.
export function PalletSimulator({ dataSet: initial }: { dataSet: DataSetKey }) {
  const [dataSet, setDataSet] = useState(initial)
  const [receiver, setReceiver] = useState<Receiver>(palletDataSets[initial].receiver)
  const [pallets, setPallets] = useState<PalletValue[]>(palletDataSets[initial].pallets)
  const order = simulatorOrder(receiver)
  const issues = validatePacking(order, {
    cartons: expandCartonGroups(palletCartonSet),
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
            options={(Object.keys(palletDataSets) as DataSetKey[]).map((key) => ({
              value: key,
              label: palletDataSets[key].name
            }))}
            onChange={(key) => {
              setDataSet(key)
              setReceiver(palletDataSets[key].receiver)
              setPallets(palletDataSets[key].pallets)
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
        <p className="text-sm">{palletDataSets[dataSet].note}</p>
      </header>
      <PolicyRules title="Pallet policy" receiver={policy?.receiver} rules={policy?.rules} />
      <PalletTable
        pallets={pallets}
        cartons={palletCartons(palletCartonSet, order.items)}
        issues={issues.filter((issue) => palletRules.has(issue.code))}
        context="PO39 / Simulator"
        showErrors
        onChange={setPallets}
      />
      <IssueReport issues={issues} codes={palletCodes} />
    </div>
  )
}
