import { validatePacking } from "@repo/copacker-packing-rules"
import { cartonPolicies } from "@repo/copacker-packing-rules/carton-policies"
import { useState } from "react"
import { CartonTable } from "@/components/carton-table"
import { type CartonGroup, expandCartonGroups } from "@/lib/carton-groups"
import { useCartonExamples } from "./carton-examples"
import { type CartonDataSet, cartonDataSets, dataSetOrder, type Receiver, receiverNames, receivers } from "./data"
import { cartonCodes, IssueReport, PolicyRules, Setting } from "./simulator-parts"

// The carton table as the packing page runs it: every edit goes through validatePacking from @repo/aisle, and its issues
// show in the table and in full below it. Its data sets are the ones here and an example of every error, which Every
// carton error links to by ID.
export function CartonSimulator({ dataSet: initial }: { dataSet: string }) {
  const examples = useCartonExamples()
  const dataSets: Record<string, CartonDataSet> = {
    ...cartonDataSets,
    ...Object.fromEntries(examples.map((example) => [example.id, example]))
  }
  const [dataSet, setDataSet] = useState(dataSets[initial] ? initial : "withinLimits")
  const chosen = dataSets[dataSet] ?? cartonDataSets.withinLimits
  const [receiver, setReceiver] = useState<Receiver>(chosen.receiver)
  const [cartons, setCartons] = useState<CartonGroup[]>(chosen.cartons)
  const order = dataSetOrder(chosen.plenty, receiver)
  const issues = validatePacking(order, {
    cartons: expandCartonGroups(cartons),
    changes: chosen.changes ?? [],
    ...(chosen.packingGroups && { packingGroups: chosen.packingGroups })
  }).issues
  const policy = receiver === "fba" || receiver === "awd_us" ? cartonPolicies[receiver] : undefined
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">Carton validation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The real carton rules: edit any carton, or pick another data set or receiver, and validatePacking checks
            them again.
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
              setCartons(dataSets[key]!.cartons)
            }}
          />
          <Setting
            label="Receiver"
            value={receiver}
            options={receivers.map((value) => ({ value, label: receiverNames[value] }))}
            onChange={setReceiver}
          />
        </div>
        <p className="text-sm">{chosen.note}</p>
      </header>
      <PolicyRules
        title="Carton policy"
        receiver={policy?.receiver ?? (receiver === "mixed" ? "Each carton's network" : undefined)}
        rules={
          policy?.rules ??
          (receiver === "mixed" ? [...cartonPolicies.fba.rules, ...cartonPolicies.awd_us.rules] : undefined)
        }
      />
      <CartonTable
        cartons={cartons}
        products={order.items}
        issues={issues}
        context="PO39 / Simulator"
        showErrors
        onChange={(index, next) => setCartons((current) => current.map((carton, i) => (i === index ? next : carton)))}
        onDuplicate={(index) => setCartons((current) => current.toSpliced(index + 1, 0, current[index]!))}
        onDelete={(index) => setCartons((current) => current.toSpliced(index, 1))}
      />
      <IssueReport issues={issues} codes={cartonCodes} products={order.items} />
    </div>
  )
}
