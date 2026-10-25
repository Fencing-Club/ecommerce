import { Document, Font, G, Page, Path, StyleSheet, Svg, Text, View, pdf } from "@react-pdf/renderer"
import { markdownBlocks } from "@repo/copacker-shipments/markdown"
import { shippingCopy, shippingMessage } from "@repo/copacker-shipments/shipping-copy"
import {
  cartonGroupLabel,
  documentDirection,
  groupProductRequirements,
  groupShippingCartons,
  documentIssues,
  packingRecordIssues,
  shippingTotals,
  type DocumentKind,
  type DocumentSettings,
  type ShippingCarton,
  type ShippingDocumentData
} from "@repo/copacker-shipments/shipping-model"
import { productChecks, shipmentDocumentChecks, type ShippingCheck } from "@repo/copacker-shipments/shipping-rules"
import { createContext, useContext, type ReactNode } from "react"
import invariant from "tiny-invariant"

// Local assets. Node callers supply their absolute asset directory.
function registerShippingFonts(base: string) {
  Font.register({ family: "Helvetica", src: "Helvetica" })
  // Keep words and identifiers intact; CJK text may wrap between characters without inserting hyphens.
  Font.registerHyphenationCallback((word) => (/\p{Script=Han}/u.test(word) ? Array.from(word) : [word]))
  for (const [family, regular, bold] of [
    ["ShippingLatin", "Inter-Regular.ttf", "Inter-Semibold.ttf"],
    ["ShippingArabic", "Arabic-400.woff", "Arabic-600.woff"],
    ["ShippingChinese", "Chinese-400.ttf", "Chinese-600.ttf"]
  ]) {
    Font.register({
      family,
      fonts: [
        { src: `${base}/${regular}`, fontWeight: 400 },
        { src: `${base}/${bold}`, fontWeight: 600 }
      ]
    })
  }
}

let previousRender: Promise<unknown> = Promise.resolve()

// React-pdf's shared font objects retain glyph mappings between documents. Fresh registration prevents the
// second PDF from shifting Unicode punctuation and word boundaries. Serialize renders before clearing the store
// so rapid preview/settings changes cannot clear fonts that another document is still using.
export function renderShippingDocument(document: NonNullable<Parameters<typeof pdf>[0]>, fontBase = "/document-fonts") {
  const result = previousRender.then(() => {
    Font.clear()
    registerShippingFonts(fontBase)
    return pdf(document).toBlob()
  })

  previousRender = result.catch(() => undefined)
  return result
}

const styles = StyleSheet.create({
  page: { padding: 30, paddingBottom: 78, fontSize: 10.5, color: "#18181b", backgroundColor: "#ffffff" },
  header: { marginBottom: 15, gap: 4.5 },
  brand: { fontSize: 9, fontWeight: 600, color: "#52525b", justifyContent: "space-between" },
  title: { fontSize: 22.5, fontWeight: 600, lineHeight: 1.35 },
  muted: { color: "#52525b" },
  small: { fontSize: 9, color: "#52525b", lineHeight: 1.35 },
  body: { fontSize: 10.5, lineHeight: 1.35 },
  callout: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: "#f4f4f5",
    border: "0.75 solid #d4d4d8",
    marginBottom: 15,
    gap: 3.75
  },
  calloutTitle: { fontSize: 12, fontWeight: 600, lineHeight: 1.35 },
  calloutDetail: { fontSize: 9.75, lineHeight: 1.35 },
  bold: { fontWeight: 600 },
  addresses: { gap: 18, marginBottom: 15 },
  metrics: { gap: 15, marginBottom: 15 },
  metricValue: { fontSize: 15, fontWeight: 600, lineHeight: 1.35 },
  column: { flex: 1, gap: 2.25 },
  label: { fontSize: 8.25, color: "#52525b", fontWeight: 600, textTransform: "uppercase", lineHeight: 1.35 },
  heading: { fontWeight: 600, fontSize: 13.5, marginTop: 15, marginBottom: 9, lineHeight: 1.35 },
  tableHeader: {
    backgroundColor: "#f4f4f5",
    paddingVertical: 6.75,
    paddingHorizontal: 9,
    gap: 9,
    fontSize: 9,
    fontWeight: 600,
    color: "#52525b"
  },
  group: { borderBottom: "0.75 solid #d4d4d8", paddingHorizontal: 9, paddingVertical: 10.5, fontSize: 10.5, gap: 7.5 },
  row: { gap: 10, paddingVertical: 5 },
  packingRow: { gap: 9, fontSize: 9.5 },
  carton: { width: "11.65%" },
  packingCarton: { flex: 72, gap: 3 },
  packingProduct: { flex: 250, gap: 3 },
  packingSku: { flex: 104, gap: 3 },
  packingQuantity: { flex: 116, gap: 3 },
  packingTotal: { flex: 116, gap: 3 },
  packingDetail: { fontSize: 9, color: "#52525b", lineHeight: 1.35 },
  palletCartons: { flex: 150, gap: 3 },
  palletDimensions: { flex: 204, gap: 3 },
  assignment: { flex: 1 },
  checkbox: {
    width: 10.5,
    height: 10.5,
    border: "0.75 solid #71717a",
    borderRadius: 1.5,
    marginTop: 1.5,
    flexShrink: 0
  },
  check: { gap: 9 },
  taskTitle: { width: "21.57%", fontWeight: 600, fontSize: 10.5, lineHeight: 1.35 },
  footer: {
    position: "absolute",
    bottom: 30,
    height: 32,
    left: 30,
    right: 30,
    borderTop: "0.75 solid #d4d4d8",
    paddingTop: 9,
    fontSize: 8.25,
    color: "#52525b",
    justifyContent: "space-between",
    gap: 12
  },
  overview: { paddingBottom: 15, marginBottom: 15, borderBottom: "0.75 solid #d4d4d8" }
})

function documentLayout(data: ShippingDocumentData, kind: DocumentKind, settings: DocumentSettings) {
  const t = shippingCopy[settings.language]
  const dir = documentDirection(settings)
  const row = { flexDirection: dir === "rtl" ? ("row-reverse" as const) : ("row" as const) }
  const fonts =
    settings.language === "ur"
      ? ["ShippingArabic", "ShippingLatin", "ShippingChinese"]
      : ["ShippingLatin", "ShippingChinese", "ShippingArabic"]
  const numeric = new Intl.NumberFormat(settings.language, { maximumFractionDigits: 2 })
  const number = (value: number) => numeric.format(value)
  const totals = shippingTotals(data)
  const hasAmazon = data.network === "awd" || data.network === "fba"
  const network = (shipment: ShippingDocumentData) =>
    t[shipment.network === "forwarder" ? "forwarderDestination" : shipment.network]
  const natural = { direction: dir, textAlign: dir === "rtl" ? ("right" as const) : ("left" as const) }
  const ltr = { direction: "ltr" as const, textAlign: dir === "rtl" ? ("right" as const) : ("left" as const) }

  return { data, kind, settings, t, dir, row, fonts, number, totals, hasAmazon, network, natural, ltr }
}

const DocumentLayout = createContext<ReturnType<typeof documentLayout> | null>(null)
function useDocumentLayout() {
  const layout = useContext(DocumentLayout)
  invariant(layout, "Document layout is required")
  return layout
}

function Code({ children, bold = false }: { children: ReactNode; bold?: boolean }) {
  const { ltr } = useDocumentLayout()
  return <Text style={[ltr, { fontFamily: "ShippingLatin", fontWeight: bold ? 600 : 400 }]}>{children}</Text>
}

function TransportName({ shipment }: { shipment: ShippingDocumentData }) {
  const { t } = useDocumentLayout()
  const { service, collection, providerName } = shipment.transport
  if (providerName) {
    return providerName
  }

  if (collection === "pickup" && service === "parcel") {
    return t.parcelPickup
  }

  if (collection === "pickup" && service === "freight") {
    return t.freightPickup
  }

  if (collection === "delivery" || collection === "dropoff") {
    return t.supplierDelivery
  }

  return t[service]
}

function Detail({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <View style={styles.column}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.body, styles.bold]}>{value}</Text>
      {children && <Text style={styles.small}>{children}</Text>}
    </View>
  )
}

function Metrics({ values }: { values: [string, string][] }) {
  const { row } = useDocumentLayout()
  return (
    <View style={[styles.metrics, row]}>
      {values.map(([label, value]) => (
        <View style={styles.column} key={label}>
          <Text style={styles.metricValue}>{value}</Text>
          <Text style={styles.small}>{label}</Text>
        </View>
      ))}
    </View>
  )
}

// Lucide’s outlines (ISC) for the route’s icons, as the shipment page’s route bar draws them.
const routeIcons = {
  origin: [
    "M10 12h4",
    "M10 8h4",
    "M14 21v-3a2 2 0 0 0-4 0v3",
    "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",
    "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"
  ],
  stop: [
    "M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11",
    "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z",
    "M6 13h12",
    "M6 17h12"
  ],
  destination: [
    "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
    "M15 10a3 3 0 1 1-6 0a3 3 0 1 1 6 0"
  ],
  arrow: ["M5 12h14", "m12 5 7 7-7 7"]
}

function RouteIcon({ name, size, flip = false }: { name: keyof typeof routeIcons; size: number; flip?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G transform={flip ? "translate(24 0) scale(-1 1)" : undefined}>
        {routeIcons[name].map((d) => (
          <Path
            key={d}
            d={d}
            fill="none"
            stroke="#71717a"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </G>
    </Svg>
  )
}

// The stops from pickup to destination, each with the shipment page’s icon: a building for the pickup, a warehouse for
// each stop on the way and a pin for the destination.
function RouteStops({ stops }: { stops: string[] }) {
  const { row, dir } = useDocumentLayout()
  return (
    <View style={[row, { flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 15 }]}>
      {stops.map((stop, index) => {
        let icon: keyof typeof routeIcons = "stop"
        if (index === 0) {
          icon = "origin"
        } else if (index === stops.length - 1) {
          icon = "destination"
        }
        return (
          <View key={`${index}-${stop}`} style={[row, { alignItems: "center", gap: 6 }]}>
            {index > 0 && <RouteIcon name="arrow" size={8} flip={dir === "rtl"} />}
            <View style={[row, { alignItems: "center", gap: 4 }]}>
              <RouteIcon name={icon} size={10} />
              <Text style={styles.small}>{stop}</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

function PackingRoute() {
  const { data, t, row, network } = useDocumentLayout()
  const pickup = data.transport.collection === "pickup"
  const receiving = data.transport.dropoffAddress ?? data.destination
  const final = data.onward?.destination ?? data.destination
  const stops = data.stops ?? []
  const route = [
    data.origin.name,
    ...(data.transport.dropoffAddress ? [receiving.name] : []),
    ...stops.map((stop) => stop.name),
    data.network === "fba" || data.network === "awd" ? network(data) : data.destination.name,
    ...(data.onward ? [final.name] : [])
  ]
  // The supplier delivers the cartons itself: from its address to the receiving one. Any onward leg is the receiver's.
  if (data.transport.collection === "delivery") {
    return (
      <>
        <RouteStops stops={route} />
        <View style={[styles.addresses, row]}>
          <Address label={t.deliverFrom} party={data.origin} />
          {stops.map((stop) => (
            <Address key={stop.name} label={t.nextStop} party={stop} />
          ))}
          <Address label={t.transferTo} party={receiving} />
        </View>
      </>
    )
  }
  return (
    <>
      <RouteStops stops={route} />
      <View style={[styles.addresses, row]}>
        <Address label={pickup ? t.pickupFrom : t.transferTo} party={pickup ? data.origin : receiving} />
        {stops.map((stop) => (
          <Address key={stop.name} label={t.nextStop} party={stop} />
        ))}
        {(pickup || final !== receiving) && (
          <Address
            label={
              data.network === "warehouse" || (data.network === "forwarder" && !data.onward)
                ? t.transferTo
                : t.destination
            }
            party={final}
          />
        )}
      </View>
    </>
  )
}

// The pallets on the carton table's grid: each pallet, its cartons and dimensions across Product and Supplier SKU, its
// gross weight, and whether another pallet can stand on it.
function PalletTable() {
  const { data, t, row, number } = useDocumentLayout()
  if (!data.pallets?.length) {
    return null
  }
  return (
    <View style={{ marginTop: 15 }}>
      <View minPresenceAhead={36} style={[styles.tableHeader, row]}>
        <Text style={styles.packingCarton}>{t.palletSingle}</Text>
        <Text style={styles.palletCartons}>{t.cartons}</Text>
        <Text style={styles.palletDimensions}>{t.dimensions}</Text>
        <Text style={styles.packingQuantity}>{t.weight}</Text>
        <Text style={styles.packingTotal}>{t.stackable}</Text>
      </View>
      {data.pallets.map((pallet) => (
        <View key={pallet.id} style={styles.group} wrap={false}>
          <View style={[styles.packingRow, row]}>
            <View style={styles.packingCarton}>
              <Code bold>{pallet.id}</Code>
            </View>
            <View style={styles.palletCartons}>
              <Code bold>{cartonGroupLabel(pallet.cartons.map((id) => ({ id })))}</Code>
              <Text style={styles.packingDetail}>
                {number(pallet.cartons.length)} {pallet.cartons.length === 1 ? t.cartonCountOne : t.cartonCountNoun}
              </Text>
            </View>
            <View style={styles.palletDimensions}>
              <Text style={styles.bold}>{pallet.dimensions.map(number).join(" × ")} cm</Text>
            </View>
            <View style={styles.packingQuantity}>
              <Text style={styles.bold}>{number(pallet.weight)} kg</Text>
            </View>
            <View style={styles.packingTotal}>
              <Text style={styles.bold}>{pallet.stackable ? t.yes : t.no}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

function PackingReferences() {
  const { data, t, row } = useDocumentLayout()
  return (
    <>
      {data.network === "forwarder" && (
        <View wrap={false}>
          <Heading>{t.receivingReference}</Heading>
          <Code bold>{data.shipment}</Code>
          <Text style={[styles.calloutDetail, { marginVertical: 9 }]}>{t.identifyText}</Text>
          {data.onward && (
            <View style={[styles.addresses, row]}>
              <Detail label={t.onwardTransport} value={t[data.onward.service]} />
              <Detail label={t.pickupFrom} value={data.destination.name} />
            </View>
          )}
        </View>
      )}
      {data.receiving && (
        <View wrap={false}>
          <Heading>{data.receiving.repack ? t.repackingReference : t.receivedFrom}</Heading>
          <View style={{ gap: 6 }}>
            <Text style={styles.calloutDetail}>
              {[data.receiving.from?.name, data.receiving.shipment].filter(Boolean).join(" / ")}
            </Text>
            <Text style={styles.calloutDetail}>
              {t.received}: {cartonGroupLabel(data.receiving.cartons.map((id) => ({ id })))}
            </Text>
            {data.receiving.repack && (
              <Text style={styles.calloutDetail}>
                {t.dispatch}: {cartonGroupLabel(data.cartons)} / {data.shipment}
              </Text>
            )}
          </View>
        </View>
      )}
    </>
  )
}

function Handoff({ shipment }: { shipment: ShippingDocumentData }) {
  const { t } = useDocumentLayout()
  return (
    <View style={styles.callout} wrap={false}>
      <Text style={styles.calloutTitle}>
        <TransportName shipment={shipment} />
      </Text>
      <Text style={styles.calloutDetail}>{t[shipment.transport.collection]}</Text>
    </View>
  )
}

function Address({ label, party }: { label: string; party: ShippingDocumentData["origin"] }) {
  const { ltr } = useDocumentLayout()
  return (
    <View style={styles.column}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.body, styles.bold]}>{party.name}</Text>
      {party.address.map((line) => (
        <Text key={line} style={[styles.small, ltr]}>
          {line}
        </Text>
      ))}
    </View>
  )
}

function Header({ shipmentCount }: { shipmentCount: number }) {
  const { data, kind, t, row, network, settings, number } = useDocumentLayout()
  return (
    <View fixed style={styles.header}>
      <View style={[styles.brand, row]}>
        <Text>{data.company.toLocaleUpperCase(settings.language)}</Text>
        <Code bold>{data.order}</Code>
      </View>
      <Text style={styles.title}>{t[kind]}</Text>
      {kind !== "overview" && (
        <View style={[row, styles.muted, { gap: 4, fontSize: 9.75 }]}>
          <Text>{network(data)}</Text>
          <Text>/</Text>
          <Code>{data.shipment}</Code>
        </View>
      )}
      {kind === "overview" && (
        <Text style={[styles.small, { fontSize: 9.75 }]}>
          {number(shipmentCount)} {t.shipments}
        </Text>
      )}
      {kind !== "reference" && (
        <Text style={[styles.small, styles.bold]}>
          {t.for} {data.recipient.name}
        </Text>
      )}
    </View>
  )
}

function Footer() {
  const { data, kind, t, row, number, dir } = useDocumentLayout()
  return (
    <View fixed style={[styles.footer, row]}>
      <View style={{ flex: 1 }}>
        <Text>
          {data.order} / {t[kind]}
        </Text>
        <View style={[row, { gap: 3 }]}>
          <Text>
            {t.revision} {number(data.revision)} / {t.generated}
          </Text>
          <Code>{data.generatedDate}</Code>
        </View>
      </View>
      <Text
        style={{ width: "42%", textAlign: dir === "rtl" ? "left" : "right" }}
        render={({ pageNumber, totalPages }) => `${t.page} ${number(pageNumber)} ${t.of} ${number(totalPages)}`}
      />
    </View>
  )
}

function AssignmentHeader({ fixed = false }: { fixed?: boolean }) {
  const { data, t, row, hasAmazon } = useDocumentLayout()
  return (
    <View fixed={fixed} style={[styles.tableHeader, row, { fontSize: 9.75 }]}>
      <Text style={styles.carton}>{t.carton}</Text>
      {hasAmazon && <Text style={styles.assignment}>{t.amazonLabel}</Text>}
      {data.transport.carrierLabels && <Text style={styles.assignment}>{t.carrierLabel}</Text>}
    </View>
  )
}

// A label reference row, striped.
const assignmentRow = (index: number) => ({
  gap: 9,
  padding: 7.5,
  paddingHorizontal: 9,
  borderBottom: "0.75 solid #d4d4d8",
  alignItems: "center" as const,
  backgroundColor: index % 2 ? "#fafafa" : "#ffffff"
})

function AssignmentRow({ carton, index }: { carton: ShippingCarton; index: number }) {
  const { data, row, hasAmazon } = useDocumentLayout()
  return (
    <View wrap={false} style={[row, assignmentRow(index)]}>
      <View style={[styles.carton, { fontSize: 12 }]}>
        <Code bold>{carton.id}</Code>
      </View>
      {hasAmazon && (
        <View style={styles.assignment}>
          <Code>{carton.amazonLabel}</Code>
        </View>
      )}
      {data.transport.carrierLabels && (
        <View style={styles.assignment}>
          <Code>{carton.carrierLabel}</Code>
        </View>
      )}
    </View>
  )
}

// After the cartons' labels, each pallet's cartons and the label on its four sides.
function PalletLabelTable() {
  const { data, t, row } = useDocumentLayout()
  const pallets = data.pallets?.filter((pallet) => pallet.label) ?? []
  if (!pallets.length) {
    return null
  }
  return (
    <View style={{ marginTop: 15 }}>
      <View minPresenceAhead={36} style={[styles.tableHeader, row, { fontSize: 9.75 }]}>
        <Text style={styles.carton}>{t.palletSingle}</Text>
        <Text style={styles.assignment}>{t.cartons}</Text>
        <Text style={styles.assignment}>{t.palletLabelSingle}</Text>
      </View>
      {pallets.map((pallet, index) => (
        <View key={pallet.id} wrap={false} style={[row, assignmentRow(index)]}>
          <View style={[styles.carton, { fontSize: 12 }]}>
            <Code bold>{pallet.id}</Code>
          </View>
          <View style={styles.assignment}>
            <Code>{cartonGroupLabel(pallet.cartons.map((id) => ({ id })))}</Code>
          </View>
          <View style={styles.assignment}>
            <Code>{pallet.label}</Code>
          </View>
        </View>
      ))}
    </View>
  )
}

function Check({ title, detail, values }: ShippingCheck) {
  const { t, row, settings } = useDocumentLayout()
  return (
    <View wrap={false} style={[styles.check, row]}>
      <View style={styles.checkbox} />
      <Text style={styles.taskTitle}>{t[title]}</Text>
      <Text style={[styles.body, { flex: 1 }]}>{shippingMessage(settings.language, detail, values)}</Text>
    </View>
  )
}

function Heading({ children, spaced = true }: { children: ReactNode; spaced?: boolean }) {
  return (
    <Text style={[styles.heading, ...(spaced ? [] : [{ marginTop: 0, marginBottom: 0 }])]} minPresenceAhead={45}>
      {children}
    </Text>
  )
}

function ChecklistSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: 9, marginBottom: 15 }}>
      <Heading spaced={false}>{title}</Heading>
      {children}
    </View>
  )
}

export function ShippingPdf({
  data,
  kind,
  settings,
  shipments = [data],
  packingRecord = false
}: {
  data: ShippingDocumentData
  kind: DocumentKind
  settings: DocumentSettings
  shipments?: ShippingDocumentData[]
  packingRecord?: boolean
}) {
  invariant(
    (kind === "overview" ? shipments : [data]).every(
      (shipment) =>
        !(packingRecord && kind === "packing" ? packingRecordIssues(shipment) : documentIssues(shipment, kind)).length
    ),
    "Complete document details and resolve oversized carton groups before generating."
  )
  const layout = documentLayout(data, kind, settings)
  const checks = shipmentDocumentChecks(data)
  const { t, row, fonts, number, totals, network, natural } = layout
  let cartonHeading = data.network === "forwarder" ? t.prepareTransfer : t.cartonRequirements
  if (data.receiving?.repack) {
    cartonHeading = t.repack
  }

  let handoffHeading = t.handoff
  if (data.receiving) {
    handoffHeading = data.receiving.repack ? t.labelHandoff : t.preparePickup
  }

  return (
    <Document title={`${data.order} - ${t[kind]}`} author={data.company} language={settings.language}>
      <DocumentLayout value={layout}>
        <Page size={settings.paper} style={[styles.page, natural, { fontFamily: fonts }]}>
          <Header shipmentCount={shipments.length} />
          {kind === "packing" && (
            <>
              <View wrap={false}>
                {!packingRecord && (
                  <>
                    <Handoff shipment={data} />
                    <PackingRoute />
                  </>
                )}
                <Metrics
                  values={[
                    ...(data.pallets?.length
                      ? [
                          [
                            data.pallets.length === 1 ? t.palletSingle : t.pallets,
                            number(data.pallets.length)
                          ] satisfies [string, string]
                        ]
                      : []),
                    [t.cartons, number(totals.cartons)],
                    [totals.pieces === totals.items ? t.items : t.packTotal, number(totals.items)],
                    ...(totals.pieces !== totals.items
                      ? [[t.pieceTotal, number(totals.pieces)] satisfies [string, string]]
                      : []),
                    [t.weight, `${number(totals.weight)} kg`]
                  ]}
                />
              </View>
              <View fixed style={[styles.tableHeader, row, { fontSize: 9, fontWeight: 600 }]}>
                <Text style={styles.packingCarton}>{t.cartons}</Text>
                <Text style={styles.packingProduct}>{t.product}</Text>
                <Text style={styles.packingSku}>{t.supplierSku}</Text>
                <Text style={styles.packingQuantity}>{t.perCarton}</Text>
                <Text style={styles.packingTotal}>{t.total}</Text>
              </View>
              {groupShippingCartons(data.cartons).map((group) => {
                const carton = group[0]
                if (!carton) {
                  return null
                }

                return (
                  <View key={carton.id} style={styles.group} wrap={false}>
                    {carton.contents.map((item, index) => {
                      const product = data.products.find((product) => product.id === item.productId)
                      if (!product) {
                        return null
                      }

                      return (
                        <View style={[styles.packingRow, row]} key={item.productId}>
                          <View style={styles.packingCarton}>
                            {index === 0 && (
                              <>
                                <Code bold>{cartonGroupLabel(group)}</Code>
                                <Text style={styles.packingDetail}>
                                  {number(group.length)} {group.length === 1 ? t.cartonCountOne : t.cartonCountNoun}
                                </Text>
                              </>
                            )}
                          </View>
                          <View style={styles.packingProduct}>
                            <Text style={styles.bold}>{product.description}</Text>
                            {product.variant && <Text style={styles.packingDetail}>{product.variant}</Text>}
                          </View>
                          <View style={styles.packingSku}>
                            <Code>{product.supplierSku}</Code>
                          </View>
                          <View style={styles.packingQuantity}>
                            <Text style={styles.bold}>
                              {number(item.packs * product.piecesPerPack)} {t.units}
                            </Text>
                            {product.piecesPerPack > 1 && (
                              <Text style={styles.packingDetail}>
                                {shippingMessage(settings.language, "packsOf", {
                                  count: item.packs,
                                  size: product.piecesPerPack
                                })}
                              </Text>
                            )}
                          </View>
                          <View style={styles.packingTotal}>
                            <Text style={styles.bold}>
                              {number(item.packs * group.length * product.piecesPerPack)} {t.units}
                            </Text>
                            {product.piecesPerPack > 1 && (
                              <Text style={styles.packingDetail}>
                                {shippingMessage(settings.language, "packsOf", {
                                  count: item.packs * group.length,
                                  size: product.piecesPerPack
                                })}
                              </Text>
                            )}
                          </View>
                        </View>
                      )
                    })}
                    <View style={[styles.packingRow, row, { marginTop: 4 }]}>
                      <View style={styles.packingCarton} />
                      <View style={[styles.packingProduct, { fontSize: 10.5 }]}>
                        <Code bold>
                          {carton.dimensions.map(number).join(" × ")} cm / {number(carton.weight)} kg
                        </Code>
                      </View>
                      <View style={styles.packingSku} />
                      <View style={styles.packingQuantity} />
                      <View style={styles.packingTotal} />
                    </View>
                  </View>
                )
              })}
              <PalletTable />
              {!packingRecord && <PackingReferences />}
            </>
          )}
          {kind === "reference" && (
            <>
              <View fixed style={[styles.addresses, row]}>
                {data.pallets?.length ? (
                  <Detail
                    label={data.pallets.length === 1 ? t.palletSingle : t.pallets}
                    value={number(data.pallets.length)}
                  />
                ) : null}
                <Detail label={t.cartons} value={number(data.cartons.length)} />
                <Detail label={t.for} value={t.supplierAndForwarder} />
                {!data.transport.carrierLabels && <Detail label={t.carrierLabel} value={t.notRequired} />}
              </View>
              <AssignmentHeader fixed />
              {data.cartons.map((carton, index) => (
                <AssignmentRow carton={carton} index={index} key={carton.id} />
              ))}
              <PalletLabelTable />
            </>
          )}
          {kind === "checklist" && (
            <>
              <Handoff shipment={data} />
              {data.network === "forwarder" && (
                <View style={[styles.addresses, row]}>
                  <Address label={t.transferTo} party={data.destination} />
                  <Detail label={t.receivingReference} value={<Code bold>{data.shipment}</Code>}>
                    {data.origin.name} / {data.order}
                  </Detail>
                </View>
              )}
              {data.receiving && (
                <View style={[styles.addresses, row]}>
                  {data.receiving.repack ? (
                    <Detail
                      label={t.received}
                      value={<Code bold>{cartonGroupLabel(data.receiving.cartons.map((id) => ({ id })))}</Code>}
                    >
                      {number(data.receiving.cartons.length)} {t.cartons} / {data.receiving.shipment}
                    </Detail>
                  ) : (
                    <Address label={t.pickupFrom} party={data.origin} />
                  )}
                  {data.receiving.repack ? (
                    <Detail label={t.dispatch} value={<Code bold>{cartonGroupLabel(data.cartons)}</Code>}>
                      {number(data.cartons.length)} {t.cartons} / {data.shipment}
                    </Detail>
                  ) : (
                    <Detail label={t.incoming} value={<Code bold>{data.receiving.shipment}</Code>}>
                      {[data.receiving.from?.name, cartonGroupLabel(data.receiving.cartons.map((id) => ({ id })))]
                        .filter(Boolean)
                        .join(" / ")}
                    </Detail>
                  )}
                </View>
              )}
              {data.receiving && !data.receiving.repack && (
                <ChecklistSection title={t.receive}>
                  <Check title="cartonIds" detail="cartonIdsText" />
                  <Check title="condition" detail="conditionText" />
                  <Check title="contents" detail="contentsText" />
                </ChecklistSection>
              )}
              {groupProductRequirements(data.products).map((products) => {
                const product = products[0]!
                return (
                  <ChecklistSection key={product.id} title={t.preparation}>
                    <View style={styles.small} wrap={false} minPresenceAhead={30}>
                      <Code>{products.map((product) => product.supplierSku).join(" / ")}</Code>
                    </View>
                    {productChecks(product, settings.language).map((check) => (
                      <Check key={check.title} {...check} />
                    ))}
                  </ChecklistSection>
                )
              })}
              {checks.cartons.length > 0 && (
                <ChecklistSection
                  title={data.receiving ? cartonHeading : `${cartonHeading} / ${cartonGroupLabel(data.cartons)}`}
                >
                  {checks.cartons.map((check) => (
                    <Check key={check.title} {...check} />
                  ))}
                </ChecklistSection>
              )}
              {checks.pallets.length > 0 && (
                <ChecklistSection title={t.pallets}>
                  {checks.pallets.map((check) => (
                    <Check key={check.title} {...check} />
                  ))}
                </ChecklistSection>
              )}
              <ChecklistSection title={handoffHeading}>
                {checks.handoff.map((check) => (
                  <Check key={check.title} {...check} />
                ))}
              </ChecklistSection>
              {data.instructions.trim() && (
                <ChecklistSection title={t.instructions}>
                  {markdownBlocks(data.instructions).map((block, index) => (
                    <View
                      key={index}
                      style={[row, { gap: 5, paddingLeft: block.indent * 10, marginBottom: 5 }]}
                      wrap={false}
                    >
                      {block.marker && <Text>{block.marker}</Text>}
                      <Text style={{ flex: 1 }}>
                        {block.runs.map((run, index) => (
                          <Text key={index} style={run.bold ? styles.bold : {}}>
                            {run.text}
                          </Text>
                        ))}
                      </Text>
                    </View>
                  ))}
                </ChecklistSection>
              )}
            </>
          )}
          {kind === "overview" && (
            <>
              <Metrics
                values={[
                  [t.shipments, number(shipments.length)],
                  [t.cartons, number(shipments.reduce((sum, shipment) => sum + shippingTotals(shipment).cartons, 0))],
                  [t.items, number(shipments.reduce((sum, shipment) => sum + shippingTotals(shipment).items, 0))]
                ]}
              />
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{t.keepTogether}</Text>
                <Text style={styles.calloutDetail}>{t.keepTogetherText}</Text>
              </View>
              {shipments.map((shipment, index) => (
                <View key={shipment.shipment} wrap={false} style={styles.overview}>
                  <Heading spaced={false}>
                    {t.shipment} {number(index + 1)} / {network(shipment)}
                  </Heading>
                  <View style={[styles.addresses, row, { marginTop: 9 }]}>
                    <Detail label={t.cartons} value={<Code bold>{cartonGroupLabel(shipment.cartons)}</Code>}>
                      {number(shipment.cartons.length)} {t.cartons} / {number(shippingTotals(shipment).items)} {t.items}
                    </Detail>
                    <Detail label={t.transport} value={<TransportName shipment={shipment} />}>
                      {shipment.shipment}
                      {shipment.pallets?.length ? ` / ${number(shipment.pallets.length)} ${t.palletSingle}` : ""}
                    </Detail>
                  </View>
                  <View style={[styles.addresses, row]}>
                    <Address label={t.destination} party={shipment.destination} />
                  </View>
                  <View style={{ gap: 3 }}>
                    <Text style={styles.body}>
                      {t.packing} / {shipment.shipment}
                    </Text>
                    <Text style={styles.calloutDetail}>
                      {t.checklist} / {t.reference}
                    </Text>
                    {(shipment.network === "fba" || shipment.network === "awd") && (
                      <Text style={[styles.calloutDetail, styles.muted]}>
                        {t.amazonLabel} / {shipment.shipment}
                      </Text>
                    )}
                    {shipment.transport.carrierLabels && (
                      <Text style={[styles.calloutDetail, styles.muted]}>
                        {t.carrierLabel} /{" "}
                        {shipment.cartons
                          .map((carton) => carton.carrierLabel)
                          .filter(Boolean)
                          .join(", ")}
                      </Text>
                    )}
                    {shipment.pallets
                      ?.filter((pallet) => pallet.label)
                      .map((pallet) => (
                        <Text key={pallet.id} style={[styles.calloutDetail, styles.muted]}>
                          {t.palletLabelSingle} / {pallet.label}
                        </Text>
                      ))}
                    {shipment.transport.billOfLading && (
                      <Text style={[styles.calloutDetail, styles.muted]}>
                        {t.bol} / {shipment.transport.billOfLading}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </>
          )}
          <Footer />
        </Page>
      </DocumentLayout>
    </Document>
  )
}
