import { packingRequirementsSchema } from "@repo/aisle/packing-requirements"
import { Fragment } from "react"
import { shippingCopy, shippingMessage } from "@/documents/shipping-copy"
import { productChecks, shipmentDocumentChecks, type ShippingCheck } from "@/documents/shipping-rules"
import { receiverNames } from "./data"
import { simulatorHref } from "./error-table"
import {
  type Arrangement,
  arrangementOptions,
  isPacketDataSet,
  packetDataSets,
  type PacketDataSetId,
  simulatePacket
} from "./packet-data"

const t = shippingCopy.en
const story = "simulators-supplier-packet--packet"

// A simulator link with a data set and its arrangement loaded, as Storybook takes args from the URL.
function packetHref(dataSet: PacketDataSetId, arrangement: Arrangement) {
  const args = Object.entries(arrangement).map(([key, value]) => `${key}:${value}`)
  return `${simulatorHref(story, dataSet)};${args.join(";")}`
}

// One way a shipment can travel: a data set's cartons, and pallets if any, shipped as arranged. Pallets go by freight,
// and only to Amazon by AGL.
type Shipment = { dataSet: PacketDataSetId; arrangement: Arrangement }
// One data set for each kind of packing: cartons or pallets, to each receiver.
const packings = Object.keys(packetDataSets)
  .filter(isPacketDataSet)
  .filter((id, index, ids) => {
    const set = packetDataSets[id]
    const kind = (other: PacketDataSetId) =>
      `${packetDataSets[other].receiver}-${"pallets" in packetDataSets[other]}-${"requirements" in packetDataSets[other]}`
    return !("requirements" in set) && ids.findIndex((other) => kind(other) === kind(id)) === index
  })
const shipments: Shipment[] = packings.flatMap((dataSet) =>
  arrangementOptions.service.flatMap(({ value: service }) => {
    const set = packetDataSets[dataSet]
    if (("pallets" in set && service !== "freight") || (set.receiver === "warehouse" && service === "agl")) {
      return []
    }
    return arrangementOptions.collection.flatMap(({ value: collection }) =>
      arrangementOptions.carrierLabels.map(({ value: carrierLabels }) => ({
        dataSet,
        arrangement: { service, handoff: "supplier", collection, carrierLabels }
      }))
    )
  })
)

// What decides a line: where the cartons go, whether they're on pallets, and how they travel, as the simulator names
// each.
const named = <Key extends keyof Arrangement>(key: Key, value: Arrangement[Key]) =>
  arrangementOptions[key].find((option) => option.value === value)?.label ?? value
const dimensions: { name: string; of: (shipment: Shipment) => string }[] = [
  { name: "Receiver", of: ({ dataSet }) => receiverNames[packetDataSets[dataSet].receiver] },
  { name: "Pallets", of: ({ dataSet }) => ("pallets" in packetDataSets[dataSet] ? "Yes" : "No") },
  { name: "Service", of: ({ arrangement }) => named("service", arrangement.service) },
  { name: "Collection", of: ({ arrangement }) => named("collection", arrangement.collection) },
  { name: "Carrier labels", of: ({ arrangement }) => named("carrierLabels", arrangement.carrierLabels) }
]

// When a line is printed: the values of each dimension it needs, when those alone pick out the shipments that print
// it; otherwise how many shipments print it.
function when(printing: Shipment[]) {
  const needs = dimensions.flatMap((dimension) => {
    const values = new Set(printing.map(dimension.of))
    const all = new Set(shipments.map(dimension.of))
    return values.size < all.size ? [{ dimension, values }] : []
  })
  const matching = shipments.filter((shipment) =>
    needs.every(({ dimension, values }) => values.has(dimension.of(shipment)))
  )
  if (matching.length !== printing.length) {
    return `${printing.length} of ${shipments.length} shipments`
  }
  return needs.length
    ? needs.map(({ dimension, values }) => `${dimension.name}: ${[...values].join(", ")}`).join("; ")
    : "Every packet"
}

type Row = {
  section: string
  check: ShippingCheck
  when: string
  production: string
  href: string
}

// Every line the packing checklist can print, by section, worded as the English packet words it: each product
// preparation and label the buyer can ask for, then each carton, pallet and handoff line, with when it's printed,
// whether production's packet export reaches it, and a link to a shipment in the simulator that prints it.
function checklistRows(): Row[] {
  const requirements = packetDataSets.requirements
  const tasks = [
    ...packingRequirementsSchema.shape.preparation.options.filter((option) => option !== "none"),
    ...packingRequirementsSchema.shape.labels.element.options
  ]
  const preparation = productChecks(
    { id: "every", supplierSku: "", description: "", piecesPerPack: 3, tasks, countryCode: "CN" },
    "en"
  ).map(
    (check): Row => ({
      section: t.preparation,
      check,
      when: check.title === "packQuantity" ? "A product sold in multi-packs" : "The buyer asks for it on a product",
      production: "Yes",
      href: packetHref("requirements", requirements.arrangement)
    })
  )
  const printed = new Map<
    string,
    { section: string; check: ShippingCheck; shipments: Shipment[]; refusals: string[] }
  >()
  for (const shipment of shipments) {
    const packet = simulatePacket(packetDataSets[shipment.dataSet], shipment.arrangement)
    const checks = shipmentDocumentChecks(packet.data)
    for (const [section, lines] of [
      [t.cartonRequirements, checks.cartons],
      [t.pallets, checks.pallets],
      [t.handoff, checks.handoff]
    ] as const) {
      for (const check of lines) {
        const key = JSON.stringify([section, check])
        const line = printed.get(key) ?? { section, check, shipments: [], refusals: [] }
        line.shipments.push(shipment)
        line.refusals.push(packet.refusal ?? "")
        printed.set(key, line)
      }
    }
  }
  return [
    ...preparation,
    ...[...printed.values()].map(({ section, check, shipments: printing, refusals }): Row => {
      const exported = refusals.indexOf("")
      const first = printing[Math.max(exported, 0)]!
      return {
        section,
        check,
        when: when(printing),
        production: exported >= 0 ? "Yes" : `Not yet: ${refusals[0]}`,
        href: packetHref(first.dataSet, first.arrangement)
      }
    })
  ]
}

export function PacketCatalog() {
  const rows = checklistRows()
  // In the order the checklist prints them.
  const sections = [t.preparation, t.cartonRequirements, t.pallets, t.handoff]
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">Every checklist line</h1>
      <p className="text-sm text-muted-foreground">
        Every line the supplier’s packing checklist can print, from the checklist rules: each product requirement, then
        each carton, pallet and handoff line across {shipments.length} ways to ship the data sets, with when it’s
        printed and whether production’s packet export reaches it yet.
      </p>
      <table aria-label="Every checklist line" className="w-full rounded-lg border bg-card text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Line</th>
            <th className="px-3 py-2 font-medium">Text</th>
            <th className="px-3 py-2 font-medium">Printed when</th>
            <th className="px-3 py-2 font-medium">Production</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <Fragment key={section}>
              <tr className="border-t bg-muted/50">
                <th colSpan={4} scope="rowgroup" className="px-3 py-2 font-semibold">
                  {section}
                </th>
              </tr>
              {rows
                .filter((row) => row.section === section)
                .map((row) => (
                  <tr key={JSON.stringify(row.check)} className="border-t align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium">{t[row.check.title]}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{row.check.detail}</p>
                    </td>
                    <td className="px-3 py-2">{shippingMessage("en", row.check.detail, row.check.values)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.when}</td>
                    <td className="px-3 py-2">
                      <p className={row.production === "Yes" ? "" : "text-destructive"}>{row.production}</p>
                      <a href={row.href} target="_top" className="mt-1 inline-block underline underline-offset-4">
                        Open in simulator
                      </a>
                    </td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
