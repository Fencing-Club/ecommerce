import type { OrderInput } from "@repo/copacker-orders"
import type { PackingRule, ValidationIssue } from "@repo/copacker-packing-rules"
import { objectKeys } from "ts-extras"
import { useTranslations } from "use-intl"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { issueValues } from "@/lib/packing-messages"
import { cn } from "@/lib/utils"

// The simulator that lists each code validatePacking can report, in the order its coverage strip shows them, so the
// strip says which a data set produces. A code missing here fails type checks, so a new rule shows up in a simulator.
const codeSimulators = {
  cartonSize: "carton",
  cartonWeight: "carton",
  unitsPerCarton: "carton",
  oneSku: "carton",
  samePacking: "carton",
  missingAsin: "carton",
  missingFnsku: "carton",
  packingGroups: "carton",
  incompletePacks: "carton",
  overQuantity: "carton",
  duplicateCarton: "carton",
  repeatedProduct: "carton",
  mixedNetworks: "carton",
  unknownProduct: "carton",
  unknownChange: "carton",
  palletFootprint: "pallet",
  palletHeight: "pallet",
  stackableHeight: "pallet",
  palletWeight: "pallet",
  noPallets: "pallet",
  emptyPallet: "pallet",
  duplicatePallet: "pallet",
  unknownPalletCarton: "pallet",
  palletCartonTwice: "pallet",
  cartonsOffPallets: "pallet",
  palletMixedNetworks: "pallet"
} as const satisfies Record<PackingRule["code"], "carton" | "pallet">
export const cartonCodes = objectKeys(codeSimulators).filter((code) => codeSimulators[code] === "carton")
export const palletCodes = objectKeys(codeSimulators).filter((code) => codeSimulators[code] === "pallet")

// A labelled select for a simulator's settings.
export function Setting<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <label className="flex min-w-48 flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <Select items={options} value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger aria-label={label} className="h-9 w-full bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </label>
  )
}

// A policy's rules as @repo/copacker-packing-rules keeps them: each one's description, the page that states it, and its data.
export function PolicyRules({
  title,
  receiver,
  rules
}: {
  title: string
  receiver?: string
  rules?: readonly { type: string; description: string; source?: string }[]
}) {
  return (
    <section aria-label={title} className="rounded-lg border bg-card p-4 text-sm">
      <h2 className="font-semibold">{title}</h2>
      {rules ? (
        <>
          <p className="mt-1 text-muted-foreground">Receiver: {receiver}</p>
          <ul className="mt-3 flex flex-col gap-3">
            {rules.map(({ description, source, ...data }) => (
              <li key={JSON.stringify(data) + description}>
                <p>
                  {description}
                  {source && (
                    <>
                      {" "}
                      <a href={source} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                        Source
                      </a>
                    </>
                  )}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{JSON.stringify(data)}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-muted-foreground">No policy: only the rules that hold everywhere apply.</p>
      )}
    </section>
  )
}

// Every issue the engine reported, as readiness checks word them for the order's products, and which of the codes it
// can report appeared.
export function IssueReport({
  issues,
  codes,
  products
}: {
  issues: ValidationIssue[]
  codes: readonly PackingRule["code"][]
  products: OrderInput["items"]
}) {
  const rules = useTranslations("server.readiness.packing")
  const seen = new Set(issues.map((issue) => issue.code))
  return (
    <section aria-label="Issues" className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm">
      <h2 className="font-semibold">
        {issues.length === 1 ? "1 issue" : `${issues.length} issues`} from validatePacking
      </h2>
      {issues.length > 0 && (
        <table className="w-full text-left">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pe-3 font-medium">Code</th>
              <th className="py-1 pe-3 font-medium">Carton or pallet</th>
              <th className="py-1 pe-3 font-medium">Fields</th>
              <th className="py-1 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, index) => (
              <tr
                key={`${issue.code}-${issue.cartonId ?? issue.palletId ?? ""}-${index}`}
                className="border-t align-top"
              >
                <td className="py-1.5 pe-3 font-mono text-xs">{issue.code}</td>
                <td className="py-1.5 pe-3">
                  {issue.cartonId ?? (issue.palletId && `Pallet ${issue.palletId}`) ?? "Packing"}
                </td>
                <td className="py-1.5 pe-3">{issue.fields?.join(", ")}</td>
                <td className="py-1.5">{rules(issue.code, issueValues(issue, products))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ul aria-label="Codes" className="flex flex-wrap gap-1.5">
        {codes.map((code) => (
          <li
            key={code}
            className={cn(
              "rounded-md border px-2 py-0.5 font-mono text-xs",
              seen.has(code)
                ? "border-destructive-border bg-destructive-soft text-destructive"
                : "text-muted-foreground"
            )}
          >
            {seen.has(code) ? `${code} ✓` : code}
          </li>
        ))}
      </ul>
    </section>
  )
}
