import { Toast } from "@base-ui/react/toast"
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@buildkitgg/shadcn"
import { type OrderInput, orderLine, orderSubtotal } from "@repo/copacker-orders"
import { packingTasks } from "@repo/copacker-orders/packing-requirements"
// Interactive fixtures for the approved Pen flow. These local transitions do not call order APIs.
import { packingSchema, type Packing, type PackingDraft } from "@repo/copacker-shipments"
import { documentSettingsForLocale, type ShippingDocumentData } from "@repo/copacker-shipments/shipping-model"
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Factory,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Ellipsis,
  FileText,
  Download,
  MapPin,
  Plus,
  Pencil,
  ScanBarcode,
  Ship,
  Trash2,
  Truck,
  Upload
} from "lucide-react"
import { useId, useState } from "react"
import { match } from "ts-pattern"
import { useLocale } from "use-intl"
import { AddProductsDialog } from "@/components/add-products-dialog"
import { CartonList } from "@/components/carton-list"
import { StatusBadge } from "@/components/common"
import { DetailFields } from "@/components/detail-fields"
import { FileDropzone, pdfFiles } from "@/components/file-dropzone"
import { SelectControl } from "@/components/form-select"
import { Markdown } from "@/components/markdown"
import { NumberInput, InputGroupNumberInput } from "@/components/number-input"
import { DialogContent } from "@/components/overlay-content"
import { PackedProductsTable } from "@/components/packed-products-table"
import { PackingForm } from "@/components/packing-form"
import { PalletList } from "@/components/pallet-list"
import { PoTimeline, type TimelineEntry } from "@/components/po-timeline"
import { ProductDownloadsMenu } from "@/components/product-downloads-menu"
import { ProductIdentity } from "@/components/product-identity"
import { QuantityDisplay } from "@/components/quantity-display"
import { RouteSection } from "@/components/route-section"
import { ShipmentDetails } from "@/components/shipment-details"
import { ShipmentDocuments } from "@/components/shipment-documents"
import { ShipmentLayout } from "@/components/shipment-layout"
import { useMoney } from "@/hooks/use-money"
import { cartonMeasures, editorPallets, groupCartons } from "@/lib/carton-groups"
import { packingLabelOptions, preparationOptions, type PackingRequirements } from "@/lib/packing-requirements"
import { cn } from "@/lib/utils"
import { northwindFactory } from "@/stories/fixtures/parties"
import { awdStop, fbaStop, northwindStop } from "@/stories/fixtures/routes"
import { daysAgo, orderItem } from "./fixtures/orders"
import { order, orderId, pickupLocations } from "./fixtures/purchase-orders"
const pageLayout = "@container/po flex min-w-0 flex-col gap-6 text-sm"
type Item = OrderInput["items"][number] & { taxRate?: number }
function quantityError(item: Item) {
  if (!Number.isInteger(item.pieces) || item.pieces <= 0) {
    return "Enter a positive whole number."
  }
  if (item.pieces % item.piecesPerSet !== 0) {
    return `Enter a multiple of ${item.piecesPerSet}.`
  }
  return null
}
function QuantityInput({
  item,
  shipmentId,
  onChange
}: {
  item: Item
  shipmentId: string
  onChange: (pieces: number) => void
}) {
  const [value, setValue] = useState(String(item.pieces))
  return (
    <NumberInput
      min={item.piecesPerSet}
      step={item.piecesPerSet}
      aria-invalid={!!quantityError(item)}
      aria-describedby={quantityError(item) ? `quantity-error-${shipmentId}-${item.id}` : undefined}
      aria-label={`${item.buyerSku} quantity`}
      className="px-2 text-end"
      value={value}
      onChange={(event) => {
        setValue(event.target.value)
        onChange(event.target.valueAsNumber || 0)
      }}
    />
  )
}
function TaxInput({
  id,
  label,
  taxRate,
  onChange
}: {
  id: string
  label: string
  taxRate: number
  onChange: (value: number) => void
}) {
  const [value, setValue] = useState(String(taxRate))
  return (
    <InputGroup>
      <InputGroupNumberInput
        id={id}
        aria-label={label}
        min={0}
        max={100}
        step="any"
        value={value}
        onBlur={() => setValue(String(taxRate))}
        onChange={(event) => {
          setValue(event.target.value)
          onChange(Math.min(100, Math.max(0, event.target.valueAsNumber || 0)))
        }}
        className="min-w-0 px-2 text-end"
      />
      <InputGroupAddon align="inline-end" className="pe-2">
        %
      </InputGroupAddon>
    </InputGroup>
  )
}
function timelineEvent(key: string, content: string, time: string, day = 15): TimelineEntry {
  return {
    key,
    content,
    at: new Date(`October ${day}, 2026 ${time} GMT+0000`),
    comment: false,
    author: null,
    authorOrg: null,
    revision: null,
    revisionNumber: null
  }
}
type Adjustment = { id: string; name: string; amount: number }
const receivingStops = {
  forwarder: {
    name: "Bayline Freight",
    location: "Ningbo warehouse",
    address: "18 Gangqiao Road, Beilun, Ningbo, Zhejiang 315800, China",
    kind: "Freight forwarder"
  },
  warehouse: {
    name: "Harbor Goods",
    location: "Ningbo receiving",
    address: "120 Port Road, Beilun, Ningbo, Zhejiang 315800, China",
    kind: "Receiving address"
  }
}
type StopKey = keyof typeof receivingStops
type Shipment = {
  id: string
  destination: string
  stop: boolean
  stopKey?: StopKey
  transport: string
  firstLeg?: string
  items: Item[]
}
const receivingStop = (shipment: Shipment) => receivingStops[shipment.stopKey ?? "forwarder"]
function onwardShipper(shipment: Shipment) {
  if (!shipment.stop) {
    return "Supplier"
  }
  return shipment.stopKey === "warehouse" ? "Buyer" : "Forwarder"
}
type State =
  | "draft"
  | "awaiting"
  | "submitted"
  | "accepted"
  | "proposing"
  | "review"
  | "pending"
  | "changes_requested"
  | "rejected"
  | "declined"
type Change = "price" | "quantity" | "both" | "removedAdjustment" | "products"
type Action = "accept" | "send" | "request" | "reject" | "decline" | null
const products = [
  orderItem({
    name: "Waffle bath towel",
    variant: "Natural / Large / 70 × 140 cm",
    buyerSku: "HG-WBT-NAT",
    supplierSku: "NT-WB-2210",
    pieces: 240,
    unitPrice: 920,
    fnsku: "X001NATURAL",
    asin: "B000000001",
    piecesPerSet: 1
  }),
  orderItem({
    name: "Waffle bath towel",
    variant: "Sage / Large / 70 × 140 cm",
    buyerSku: "HG-WBT-SAG",
    supplierSku: "NT-WB-2214",
    pieces: 180,
    unitPrice: 920,
    fnsku: "X001SAGE000",
    asin: "B000000002",
    piecesPerSet: 1
  }),
  orderItem({
    name: "Cotton tea towel (2 Pack)",
    variant: "Stripe / Cotton / 50 × 70 cm",
    buyerSku: "HG-CTT-STR-2PK",
    supplierSku: "NT-CT-3100",
    pieces: 120,
    unitPrice: 410,
    fnsku: "X001STRIPE0",
    asin: "B000000003",
    piecesPerSet: 2
  })
]
// Cartons are ready in two weeks, so packing can finish.
const readyDate = daysAgo(-14).toISOString().slice(0, 10)
const packingCharge = { id: "packing", name: "Packing", amount: 12000 }
const handlingCharge = { id: "handling", name: "Handling", amount: 2500 }
const productImages = [
  "https://images.unsplash.com/photo-1636714573130-bbb1d4b19cc1?w=160&fit=crop",
  "https://images.unsplash.com/photo-1784371542080-0d38a43bcf23?w=160&fit=crop",
  "https://images.unsplash.com/photo-1773096433498-199e63a05bc6?w=160&fit=crop"
]
const dialogFooterClass = "mx-0 mb-0 mt-2 flex-row justify-end border-0 bg-transparent p-0 sm:justify-end"
function PriceInput({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState("")
  return (
    <InputGroupInput
      aria-label={label}
      inputMode="decimal"
      className="min-w-0 px-1 text-end tabular-nums"
      value={focused ? draft : (value / 100).toFixed(2)}
      onFocus={() => {
        setDraft((value / 100).toFixed(2))
        setFocused(true)
      }}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        const next = event.target.value
        if (/^\d*(\.\d{0,2})?$/.test(next)) {
          setDraft(next)
          onChange(Math.round(Number(next || 0) * 100))
        }
      }}
    />
  )
}
function SelectChoice({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next) {
          onChange(next)
        }
      }}
    >
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
function FutureButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={label}
            aria-disabled="true"
            className="text-muted-foreground"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>Coming soon</TooltipContent>
    </Tooltip>
  )
}
function ValueChange({
  before,
  after,
  price = false
}: {
  before: number | null
  after: number | null
  price?: boolean
}) {
  const cash = useMoney()
  const format = (value: number) => (price ? cash(value) : value.toLocaleString("en-US"))
  if (before === after) {
    return <span>{before === null ? "—" : format(before)}</span>
  }
  return (
    <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap tabular-nums">
      {before !== null && <del className="text-destructive">{format(before)}</del>}
      {before !== null && after !== null && (
        <>
          <ArrowRight aria-hidden className="size-3 text-muted-foreground" />
          <span className="sr-only">to</span>
        </>
      )}
      {after !== null && (
        <ins className="font-medium text-green-800 dark:text-green-400 no-underline">{format(after)}</ins>
      )}
    </span>
  )
}
function InvoiceRow({ name, onView }: { name: string; onView: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border p-3">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      <Button variant="outline" size="sm" onClick={onView}>
        View
      </Button>
    </div>
  )
}
export function PurchaseOrderFlow({
  viewer = "buyer",
  initialState = "draft",
  viaForwarder = false,
  change = "price",
  initialDialog = null,
  missingInvoice = false,
  initialPaid = false,
  initialPaymentDialog = false,
  timelineExample = false,
  initialPacking,
  forwarderPickup = false,
  mixedFba = false,
  labelsReady = false
}: {
  viewer?: "buyer" | "supplier"
  initialState?: State
  viaForwarder?: boolean
  change?: Change
  initialDialog?: Action
  missingInvoice?: boolean
  initialPaid?: boolean
  initialPaymentDialog?: boolean
  timelineExample?: boolean
  initialPacking?: "editing" | "ready" | "packed"
  forwarderPickup?: boolean
  mixedFba?: boolean
  labelsReady?: boolean
}) {
  const cash = useMoney()
  const controlId = useId()
  const [state, setState] = useState<State>(initialState)
  const initialItems = products.map((item, index) => {
    if (mixedFba) {
      return {
        ...item,
        name: index === 2 ? "Cotton tea towel" : "Cotton drawstring bag",
        buyerSku: ["HG-CDB-NAT", "HG-CDB-SAG", "HG-CTT-STR"][index]!,
        supplierSku: ["NT-CDB-100", "NT-CDB-102", "NT-CT-3100"][index]!,
        variant: index === 2 ? "Stripe / 50 × 70 cm" : `${index === 0 ? "Natural" : "Sage"} / Medium / 20 × 30 cm`,
        pieces: [45, 60, 75][index]!,
        piecesPerSet: 1
      }
    }
    if (initialState === "proposing" && index === 0) {
      return { ...item, unitPrice: 950, pieces: viewer === "buyer" ? 300 : item.pieces }
    }
    return item
  })
  const [shipments, setShipments] = useState<Shipment[]>(
    viaForwarder || mixedFba
      ? [
          {
            id: "1",
            destination: mixedFba ? "Amazon FBA" : "Amazon AWD US",
            stop: viaForwarder,
            firstLeg: forwarderPickup ? "Forwarder pickup" : "Supplier ships",
            transport: "Amazon pickup",
            items: initialItems
          }
        ]
      : [
          {
            id: "1",
            destination: "Amazon AWD US",
            stop: viaForwarder,
            transport: "Amazon pickup",
            items: initialItems.slice(0, 2)
          },
          { id: "2", destination: "Amazon FBA", stop: false, transport: "Supplier ships", items: initialItems.slice(2) }
        ]
  )
  const [editing, setEditing] = useState<string | null>(null)
  const [adjustments, setAdjustments] = useState<Adjustment[]>(
    initialState === "proposing" ? [packingCharge, handlingCharge] : []
  )
  const [action, setAction] = useState<Action>(initialDialog)
  const [invoiceMode, setInvoiceMode] = useState(missingInvoice ? "upload" : "generate")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState(false)
  const [invoiceGenerated, setInvoiceGenerated] = useState(false)
  const [reason, setReason] = useState("")
  const [decisionReason, setDecisionReason] = useState("")
  const [comments, setComments] = useState<TimelineEntry[]>([])
  const [packing, setPacking] = useState<Shipment | null>(initialPacking ? shipments[0]! : null)
  const [packingFinished, setPackingFinished] = useState(initialPacking === "packed")
  const [packingDetails, setPackingDetails] = useState<Item | null>(null)
  const [requirements, setRequirements] = useState<Record<string, PackingRequirements>>({})
  const defaultRequirement: PackingRequirements = {
    preparation: "sealedPolybag",
    labels: ["fnsku", "suffocation"],
    countryCode: viewer === "supplier" ? "CN" : "",
    instructions: "Keep the label visible on the outside of the bag."
  }
  function packingRequirementsFor(item: Item) {
    return requirements[item.id] ?? defaultRequirement
  }
  const requirement = packingDetails ? packingRequirementsFor(packingDetails) : defaultRequirement
  function updateRequirement(change: Partial<PackingRequirements>) {
    if (packingDetails) {
      setRequirements({ ...requirements, [packingDetails.id]: { ...requirement, ...change } })
    }
  }
  const [stopFor, setStopFor] = useState<string | null>(null)
  const [stopDraft, setStopDraft] = useState<{ stopKey: StopKey; firstLeg: string; transport: string }>({
    stopKey: "forwarder",
    firstLeg: "Supplier ships",
    transport: "Amazon pickup"
  })
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [details, setDetails] = useState({
    reference: "",
    terms: "Net 30",
    notes:
      "- Pack each item as specified.\n- Record each carton's weight, dimensions, and quantity of each SKU in the packing list."
  })
  const [detailsDraft, setDetailsDraft] = useState(details)
  const [earlierActivity, setEarlierActivity] = useState(false)
  const [deletingShipment, setDeletingShipment] = useState<Shipment | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const [adjustmentDraft, setAdjustmentDraft] = useState<Adjustment[]>([])
  const [savedShipments, setSavedShipments] = useState(shipments)
  const [acceptedShipments, setAcceptedShipments] = useState(
    shipments.map((shipment) => ({
      ...shipment,
      items: shipment.items.map((item) =>
        initialState === "proposing" && item.id === products[0]!.id
          ? { ...item, pieces: 240, unitPrice: viewer === "buyer" ? 950 : 920 }
          : item
      )
    }))
  )
  const [acceptedAdjustments, setAcceptedAdjustments] = useState<Adjustment[]>(
    initialState === "proposing" && viewer === "buyer" ? [packingCharge, handlingCharge] : []
  )
  const [proposal, setProposal] = useState<{ shipments: Shipment[]; adjustments: Adjustment[] } | null>(null)
  const [reviewOwn, setReviewOwn] = useState(false)
  const [proposalAuthor, setProposalAuthor] = useState(
    initialState === "changes_requested" || initialState === "pending"
  )
  const [beforeProposing, setBeforeProposing] = useState<State>(
    viewer === "supplier" && initialState === "proposing" ? "awaiting" : "accepted"
  )
  const [costSources, setCostSources] = useState<Record<string, string>>({})
  const [proposalMessage, setProposalMessage] = useState("")
  const allItems = shipments.flatMap((shipment) => shipment.items)
  const subtotal = orderSubtotal(allItems)
  const total = subtotal + adjustments.reduce((sum, row) => sum + row.amount, 0)
  const acceptedTotal =
    orderSubtotal(acceptedShipments.flatMap((shipment) => shipment.items)) +
    acceptedAdjustments.reduce((sum, row) => sum + row.amount, 0)
  const hasProposalChanges =
    JSON.stringify(shipments) !== JSON.stringify(acceptedShipments) ||
    JSON.stringify(adjustments) !== JSON.stringify(acceptedAdjustments)
  const includedTax = allItems.reduce(
    (sum, item) => sum + Math.round((item.pieces * item.unitPrice * (item.taxRate ?? 0)) / (100 + (item.taxRate ?? 0))),
    0
  )
  const [events, setEvents] = useState<{ text: string; time: string }[]>(
    initialPaid ? [{ text: `Maya at Northwind Textiles marked ${cash(total)} as paid.`, time: "10:05 AM" }] : []
  )
  function recordEvent(text: string) {
    setEvents((current) => [{ text, time: "2:15 PM" }, ...current])
  }
  const [paidAmount, setPaidAmount] = useState<number | null>(initialPaid ? total : null)
  const [paymentAction, setPaymentAction] = useState<"paid" | "unpaid" | null>(initialPaymentDialog ? "paid" : null)
  const paid = paidAmount !== null && paidAmount >= total
  const paymentStatus = match({ paid, paidAmount })
    .with({ paid: true }, () => "Paid")
    .with({ paidAmount: null }, () => "Unpaid")
    .otherwise(() => "Partially paid")
  const recipient = viewer === "supplier" ? "Harbor Goods" : "Northwind Textiles"
  const reviewing = state === "review"
  const proposing = state === "proposing"
  const canEdit = state === "draft" || proposing
  const accepted = ["accepted", "pending", "changes_requested", "rejected"].includes(state)
  const canConfirmPayment = viewer === "supplier" && (accepted || state === "awaiting")
  const beforeItems = reviewOwn
    ? acceptedShipments.flatMap((shipment) => shipment.items)
    : products.map((item, index) =>
        index === 0 && ["quantity", "removedAdjustment"].includes(change) ? { ...item, unitPrice: 950 } : item
      )
  const fixtureAfterItems = beforeItems.flatMap((item, index) =>
    change === "products" && index === 1
      ? []
      : [
          {
            ...item,
            pieces: index === 0 && ["quantity", "both"].includes(change) ? 300 : item.pieces,
            unitPrice: index === 0 && ["price", "both"].includes(change) ? 950 : item.unitPrice
          }
        ]
  )
  if (change === "products") {
    fixtureAfterItems.push({
      ...products[1]!,
      id: "added-product",
      name: "Cotton drawstring bag",
      variant: "Natural / Medium / 20 × 30 cm",
      buyerSku: "HG-CDB-NAT",
      unitPrice: 320,
      pieces: 60
    })
  }
  const afterItems =
    reviewOwn && proposal ? proposal.shipments.flatMap((shipment) => shipment.items) : fixtureAfterItems
  const oldAdjustments = reviewOwn
    ? acceptedAdjustments
    : match(change)
        .with("removedAdjustment", "quantity", () => [packingCharge, handlingCharge])
        .otherwise(() => [])
  const newAdjustments =
    reviewOwn && proposal
      ? proposal.adjustments
      : match(change)
          .with("removedAdjustment", () => [packingCharge])
          .with("price", "both", "quantity", () => [packingCharge, handlingCharge])
          .otherwise(() => [])
  const originalTotal = orderSubtotal(beforeItems) + oldAdjustments.reduce((sum, row) => sum + row.amount, 0)
  const proposedTotal = orderSubtotal(afterItems) + newAdjustments.reduce((sum, row) => sum + row.amount, 0)
  const changedProductIds = [...new Set([...afterItems, ...beforeItems].map((item) => item.id))].filter((id) => {
    const before = beforeItems.find((item) => item.id === id)
    const after = afterItems.find((item) => item.id === id)
    return before?.pieces !== after?.pieces || before?.unitPrice !== after?.unitPrice
  })
  const changedAdjustmentIds = [...new Set([...oldAdjustments, ...newAdjustments].map((row) => row.id))].filter(
    (id) => {
      const before = oldAdjustments.find((row) => row.id === id)
      const after = newAdjustments.find((row) => row.id === id)
      return before?.name !== after?.name || before?.amount !== after?.amount
    }
  )
  const originalQuantity = beforeItems.reduce((sum, item) => sum + item.pieces, 0)
  const proposedQuantity = afterItems.reduce((sum, item) => sum + item.pieces, 0)
  const reviewTotal = reviewing ? proposedTotal : total
  const needsInvoice = viewer === "supplier" && (action === "accept" || action === "send")
  const actionLabel = {
    accept: "Accept order",
    send: "Send for approval",
    request: "Send request",
    reject: "Reject changes",
    decline: "Decline order"
  }[action ?? "accept"]
  const revision =
    (viewer === "supplier" && change === "quantity") ||
    change === "removedAdjustment" ||
    (proposing && viewer === "buyer")
      ? 3
      : 2
  const invoiceName = reviewing || proposing ? `Invoice-PO38-rev${revision}.pdf` : "Invoice-PO38.pdf"
  const revisionCaption =
    revision === 2
      ? "Original order → Proposed revision 2"
      : `Accepted revision ${revision - 1} → Proposed revision ${revision}`
  const status = {
    draft: "Draft",
    awaiting: "Awaiting your acceptance",
    submitted: "Awaiting supplier acceptance",
    accepted: "Accepted",
    proposing: beforeProposing === "awaiting" ? "Awaiting acceptance" : "Accepted",
    review: "Awaiting your approval",
    pending: beforeProposing === "awaiting" ? "Awaiting acceptance" : "Accepted",
    changes_requested: "Accepted",
    rejected: "Accepted",
    declined: "Declined"
  }[state]
  function updateShipment(id: string, patch: Partial<Shipment>) {
    setShipments((current) => current.map((shipment) => (shipment.id === id ? { ...shipment, ...patch } : shipment)))
  }
  function deleteShipment(id: string) {
    setShipments((current) => current.filter((shipment) => shipment.id !== id))
    setSavedShipments((current) => current.filter((shipment) => shipment.id !== id))
    if (editing === id) {
      setEditing(null)
    }
    setDeletingShipment(null)
  }
  function updateItem(shipment: Shipment, id: string, patch: Partial<Item>) {
    updateShipment(shipment.id, {
      items: shipment.items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    })
  }
  function viewInvoice() {
    setInvoiceGenerated(true)
    setPreview(true)
  }
  function propose() {
    setBeforeProposing(state)
    setAcceptedShipments(shipments)
    setAcceptedAdjustments(adjustments)
    setSavedShipments(shipments)
    setState("proposing")
  }
  const hasQuantityErrors = shipments.some((shipment) => shipment.items.some((item) => quantityError(item)))
  function submitOrder() {
    if (hasQuantityErrors) {
      return
    }
    setState("submitted")
    recordEvent("You sent the order to Northwind Textiles.")
  }
  function finish() {
    if (action === "accept" && !reviewOwn) {
      setState("accepted")
      recordEvent("You accepted the order.")
      if (reviewing) {
        const next = shipments
          .map((shipment, index) => ({
            ...shipment,
            items: [
              ...shipment.items.flatMap((item) => {
                const updated = afterItems.find((row) => row.id === item.id)
                return updated ? [updated] : []
              }),
              ...(index === 0 ? afterItems.filter((item) => !beforeItems.some((row) => row.id === item.id)) : [])
            ]
          }))
          .filter((shipment) => shipment.items.length)
        setShipments(next)
        setAcceptedShipments(next)
        setAdjustments(newAdjustments)
        setAcceptedAdjustments(newAdjustments)
      }
    }
    if (action === "send") {
      setProposal({ shipments, adjustments })
      setProposalAuthor(true)
      setReviewOwn(false)
      setShipments(acceptedShipments)
      setAdjustments(acceptedAdjustments)
      setState("pending")
      recordEvent("You sent changes for approval.")
    }
    if (action === "request") {
      setProposalAuthor(false)
      setState("changes_requested")
      recordEvent(`You requested changes.${reason ? ` ${reason}` : ""}`)
    }
    if (action === "reject") {
      setState("rejected")
      recordEvent(`You rejected the proposed changes.${reason ? ` ${reason}` : ""}`)
    }
    if (action === "decline") {
      setState("declined")
      recordEvent(`You declined the order.${reason ? ` ${reason}` : ""}`)
    }
    if (action === "reject" || action === "decline" || action === "request") {
      setDecisionReason(reason.trim())
    }
    setAction(null)
    setReason("")
  }
  function packingCartons() {
    if (!packing) {
      return []
    }
    if (mixedFba) {
      return [
        {
          cartonId: "A1",
          length: 60,
          width: 40,
          height: 40,
          weight: 12.4,
          items: [
            { itemId: packing.items[1]!.id, pieces: 40 },
            { itemId: packing.items[2]!.id, pieces: 40 }
          ]
        },
        {
          cartonId: "B1",
          length: 60,
          width: 40,
          height: 40,
          weight: 12.4,
          items: [
            { itemId: packing.items[0]!.id, pieces: 30 },
            { itemId: packing.items[1]!.id, pieces: 20 },
            { itemId: packing.items[2]!.id, pieces: 10 }
          ]
        },
        {
          cartonId: "C1",
          length: 60,
          width: 40,
          height: 40,
          weight: 12.4,
          items: [
            { itemId: packing.items[0]!.id, pieces: 15 },
            { itemId: packing.items[2]!.id, pieces: 25 }
          ]
        }
      ]
    }
    if (initialPacking) {
      return packing.items.flatMap((item, index) =>
        Array.from({ length: [10, 6, 2][index]! }, (_, carton) => ({
          cartonId: `${"ABC"[index]}${carton + 1}`,
          length: index === 2 ? 50 : 60,
          width: index === 2 ? 35 : 40,
          height: [40, 50, 30][index]!,
          weight: initialPacking === "editing" && index === 1 ? undefined : [12.4, 15.2, 7.8][index]!,
          items: [
            {
              itemId: item.id,
              pieces: initialPacking === "editing" && index === 1 ? 24 : item.pieces / [10, 6, 2][index]!
            }
          ]
        }))
      )
    }
    return []
  }
  const locale = useLocale()
  const toast = Toast.useToastManager()
  const [downloadingPacking, setDownloadingPacking] = useState(false)
  const [packingRecords, setPackingRecords] = useState<Record<string, { shipment: Shipment; packing: Packing }>>(() =>
    initialPacking === "packed" && packing
      ? {
          [packing.id]: {
            shipment: packing,
            packing: packingSchema.parse({
              origin: northwindFactory,
              readyDate,
              cartons: packingCartons(),
              changes: []
            })
          }
        }
      : {}
  )
  function packingDocument(record: { shipment: Shipment; packing: Packing }): ShippingDocumentData {
    return {
      company: "Harbor Goods",
      order: "PO38",
      revision: 1,
      generatedDate: "2026-10-20",
      shipment: `Shipment ${record.shipment.id}`,
      recipient: { name: "Northwind Textiles", address: [] },
      origin: { name: record.packing.origin.name, address: [record.packing.origin.addressLine1] },
      destination: { name: record.shipment.destination, address: [] },
      network: record.shipment.destination.includes("AWD") ? "awd" : "fba",
      transport: { service: "supplier", collection: "delivery", carrierLabels: false, palletized: false },
      products: record.shipment.items.map((item) => ({
        id: item.id,
        supplierSku: item.supplierSku,
        description: item.name,
        variant: item.variant,
        piecesPerPack: item.piecesPerSet,
        tasks: packingTasks(packingRequirementsFor(item)),
        countryCode: packingRequirementsFor(item).countryCode || undefined
      })),
      cartons: record.packing.cartons.map((carton) => ({
        id: carton.cartonId,
        dimensions: [carton.length, carton.width, carton.height],
        weight: carton.weight,
        contents: carton.items.map((item) => ({
          productId: item.itemId,
          packs: item.pieces / (record.shipment.items.find((product) => product.id === item.itemId)?.piecesPerSet ?? 1)
        }))
      })),
      instructions: ""
    }
  }
  async function downloadPackingList(record: { shipment: Shipment; packing: Packing }) {
    setDownloadingPacking(true)
    try {
      const { ShippingPdf, renderShippingDocument } = await import("@/documents/shipping-pdf")
      const data = packingDocument(record)
      const blob = await renderShippingDocument(
        <ShippingPdf data={data} kind="packing" settings={documentSettingsForLocale(locale)} packingRecord />
      )
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `PO38-Shipment-${record.shipment.id}-Packing-list.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      toast.add({ title: "Could not download the packing list", type: "error" })
    } finally {
      setDownloadingPacking(false)
    }
  }
  function labelsForItem(item: Item): PackingRequirements["labels"] {
    return packingRequirementsFor(item).labels
  }
  function productDownloads(items: Item[]) {
    return packingLabelOptions
      .filter((option) => items.some((item) => labelsForItem(item).includes(option.value)))
      .map((option) => ({
        id: option.value,
        label: option.label,
        unavailable: option.value === "choking" ? "Label not provided" : undefined
      }))
  }
  async function productLabelPdf(id: string, items: Item[]) {
    const { standardProductLabels, suffocationWarningLabels, labelTitle } =
      await import("@repo/copacker-shipments/product-labels")
    const { combinePdfs } = await import("@repo/copacker-shipments/documents")
    if (id === "suffocation") {
      return suffocationWarningLabels()
    }
    if (id !== "fnsku" && id !== "sku") {
      throw new Error("The required label has not been provided")
    }
    const uniqueItems = [...new Map(items.map((item) => [item.id, item])).values()]
    return combinePdfs(
      await Promise.all(
        uniqueItems.map((item) => {
          const code = id === "fnsku" ? item.fnsku : item.buyerSku
          if (!code) {
            throw new Error("The product is missing its label code")
          }
          return standardProductLabels({ code, title: labelTitle(item.name, item.variant) })
        })
      )
    )
  }
  async function sampleLabels(kind: string, items: Item[]) {
    const { PDFDocument } = await import("pdf-lib")
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595, 842])
    page.drawText("STORYBOOK SAMPLE - NOT FOR SHIPPING", { x: 36, y: 800, size: 14 })
    page.drawText(kind, { x: 36, y: 766, size: 14 })
    items.forEach((item, index) => page.drawText(item.supplierSku, { x: 36, y: 730 - index * 24, size: 12 }))
    return pdf.save()
  }
  function saveDocument(bytes: Uint8Array, name: string) {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }))
    const link = document.createElement("a")
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function downloadProductLabels(items: Item[], ids: string[], scope: string) {
    setDownloadingPacking(true)
    try {
      const { combinePdfs } = await import("@repo/copacker-shipments/documents")
      const files = await Promise.all(
        ids.map((id) =>
          productLabelPdf(
            id,
            items.filter((item) => labelsForItem(item).some((label) => label === id))
          )
        )
      )
      saveDocument(await combinePdfs(files), `PO38-${scope}-Product-labels.pdf`)
    } catch {
      toast.add({ title: "Could not download product labels", type: "error" })
    } finally {
      setDownloadingPacking(false)
    }
  }
  async function downloadShipmentDocument(id: string) {
    if (!packing) {
      return
    }
    const record = packingRecords[packing.id]
    if (!record) {
      return
    }
    if (id === "packing") {
      await downloadPackingList(record)
      return
    }
    setDownloadingPacking(true)
    try {
      if (id === "reference" || id === "checklist") {
        const { ShippingPdf, renderShippingDocument } = await import("@/documents/shipping-pdf")
        const blob = await renderShippingDocument(
          <ShippingPdf data={releasedDocument(record)} kind={id} settings={documentSettingsForLocale(locale)} />
        )
        saveDocument(new Uint8Array(await blob.arrayBuffer()), `PO38-Shipment-${packing.id}-${id}.pdf`)
      } else {
        saveDocument(await sampleLabels(id, packing.items), `PO38-Shipment-${packing.id}-${id}-labels.pdf`)
      }
    } catch {
      toast.add({ title: "Could not download document", type: "error" })
    } finally {
      setDownloadingPacking(false)
    }
  }
  function releasedDocument(record: { shipment: Shipment; packing: Packing }): ShippingDocumentData {
    const data = packingDocument(record)
    return {
      ...data,
      destination: { ...data.destination, address: ["Storybook example destination"] },
      transport: {
        ...data.transport,
        service: record.shipment.transport === "Amazon pickup" ? "agl" : "parcel",
        collection: record.shipment.transport === "Amazon pickup" ? "pickup" : "delivery",
        carrierLabels: record.shipment.transport !== "Amazon pickup"
      },
      cartons: data.cartons.map((carton) => ({
        ...carton,
        amazonLabel: `SAMPLE-${record.shipment.id}-${carton.id}`,
        carrierLabel: record.shipment.transport !== "Amazon pickup" ? `SAMPLE-CARRIER-${carton.id}` : undefined
      }))
    }
  }
  async function downloadSupplierPack(shipmentId?: string) {
    setDownloadingPacking(true)
    try {
      const { combinePdfs } = await import("@repo/copacker-shipments/documents")
      const { renderSupplierPacket } = await import("@/documents/supplier-packet")
      const productLabels = (items: Item[]) =>
        Promise.all(
          productDownloads(items)
            .filter((label) => !label.unavailable)
            .map((label) =>
              productLabelPdf(
                label.id,
                items.filter((item) => labelsForItem(item).some((kind) => kind === label.id))
              )
            )
        )
      // A released packet carries its own shipment's product labels; otherwise they lead the pack.
      const files = labelsReady
        ? []
        : await productLabels(
            shipments
              .filter((shipment) => !shipmentId || shipment.id === shipmentId)
              .flatMap((shipment) => shipment.items)
          )
      for (const record of Object.values(packingRecords).filter(
        (record) => !shipmentId || record.shipment.id === shipmentId
      )) {
        if (labelsReady) {
          files.push(
            await renderSupplierPacket(releasedDocument(record), documentSettingsForLocale(locale), {
              product: await productLabels(record.shipment.items),
              carton: [await sampleLabels("Carton labels", record.shipment.items)],
              carrier:
                record.shipment.transport === "Amazon pickup"
                  ? []
                  : [await sampleLabels("Carrier labels", record.shipment.items)]
            })
          )
        } else {
          const { ShippingPdf, renderShippingDocument } = await import("@/documents/shipping-pdf")
          const blob = await renderShippingDocument(
            <ShippingPdf
              data={packingDocument(record)}
              kind="packing"
              settings={documentSettingsForLocale(locale)}
              packingRecord
            />
          )
          files.push(new Uint8Array(await blob.arrayBuffer()))
        }
      }
      saveDocument(
        await combinePdfs(files),
        shipmentId ? `PO38-Shipment-${shipmentId}-Packet.pdf` : "PO38-Supplier-pack.pdf"
      )
    } catch {
      toast.add({ title: "Could not download supplier pack", type: "error" })
    } finally {
      setDownloadingPacking(false)
    }
  }
  if (packing) {
    const packingOrder: OrderInput = {
      ...order,
      reference: "PO38",
      items: packing.items.map((item) => ({
        ...item,
        receiver: packing.destination === "Amazon AWD US" ? "awd_us" : "fba"
      }))
    }
    const draft: PackingDraft = packingRecords[packing.id]?.packing ?? {
      origin: northwindFactory,
      readyDate,
      cartons: packingCartons()
    }
    // The shipment's route: the factory, the receiving stop when there is one, and Amazon, with how the cartons travel
    // under it.
    const stop = packing.stop ? receivingStop(packing) : undefined
    const stops = [
      northwindStop,
      ...(stop
        ? [{ id: "stop", company: stop.name, kind: "forwarder" as const, name: stop.name, detail: stop.address }]
        : []),
      packing.destination === "Amazon AWD US" ? awdStop : fbaStop
    ]
    const transport = (
      <ShipmentTransportLegs
        legs={[
          ...(packing.stop
            ? [
                packing.firstLeg?.endsWith("pickup")
                  ? `${receivingStop(packing).name} picks up from Northwind Textiles.`
                  : `Supplier ships to ${receivingStop(packing).location}.`
              ]
            : []),
          packing.transport === "Amazon pickup"
            ? `Amazon pickup from ${packing.stop ? receivingStop(packing).location : "Northwind Textiles"}.`
            : `${onwardShipper(packing)} ships to ${packing.destination}.`
        ]}
      />
    )
    const productActions = (item: OrderInput["items"][number]) => (
      <ProductDownloadsMenu
        productName={item.supplierSku || item.buyerSku}
        items={productDownloads([item])}
        busy={downloadingPacking}
        onDownload={(ids) =>
          void downloadProductLabels([item], ids, `Shipment-${packing.id}-${item.supplierSku || item.buyerSku}`)
        }
      />
    )
    const sidebar = (summary: React.ComponentProps<typeof ShipmentDetails>) => (
      <div className="space-y-6">
        <ShipmentDocuments
          busy={downloadingPacking}
          productLabels={productDownloads(packing.items)}
          onProductDownload={(ids) => void downloadProductLabels(packing.items, ids, `Shipment-${packing.id}`)}
          onDownload={(id) => void downloadShipmentDocument(id)}
          onDownloadPacket={labelsReady ? () => void downloadSupplierPack(packing.id) : undefined}
          documents={[
            ...(packingFinished ? [{ id: "packing", label: "Packing list" }] : []),
            ...(labelsReady
              ? [
                  { id: "carton", label: "Carton labels" },
                  ...(packing.transport !== "Amazon pickup" ? [{ id: "carrier", label: "Carrier labels" }] : []),
                  { id: "checklist", label: "Packing checklist" },
                  { id: "reference", label: "Carton label reference" }
                ]
              : [])
          ]}
        />
        <ShipmentDetails {...summary} />
      </div>
    )
    const heading = (
      <div className={cn("flex flex-wrap items-center gap-3", packingFinished && "w-full")}>
        <h1 className="text-2xl font-semibold">Shipment {packing.id}</h1>
        <StatusBadge tone={packingFinished ? "success" : "info"}>{packingFinished ? "Packed" : "Packing"}</StatusBadge>
        {packingFinished && (
          <div className="ms-auto flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="outline" onClick={() => setPackingFinished(false)}>
              Edit packing
            </Button>
          </div>
        )}
      </div>
    )
    const cartons = groupCartons(draft.cartons)
    const pallets = draft.palletized ? editorPallets(draft.pallets) : undefined
    return (
      <div className={pageLayout}>
        <div className="flex items-center gap-2 text-meta text-muted-foreground">
          <button
            className="focus-ring rounded-sm hover:text-foreground"
            aria-label="Back to order"
            onClick={() => setPacking(null)}
          >
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </button>
          <span>Orders</span>
          <ChevronRight className="size-3" />
          <button className="hover:text-foreground" onClick={() => setPacking(null)}>
            PO38
          </button>
          <ChevronRight className="size-3" />
          <span>Shipment {packing.id}</span>
        </div>
        {packingFinished ? (
          <ShipmentLayout
            header={<div className="flex flex-wrap items-center justify-between gap-3">{heading}</div>}
            details={
              <RouteSection
                route={{ stops, legs: [] }}
                buyer="Harbor Goods"
                readyDate={draft.readyDate}
                notes={transport}
              />
            }
            products={
              <PackedProductsTable
                order={packingOrder}
                cartons={cartons}
                reserved={{}}
                renderActions={productActions}
              />
            }
            sidebar={sidebar({ readyDate: draft.readyDate ?? "", ...cartonMeasures(cartons, pallets) })}
          >
            <CartonList readOnly showErrors order={packingOrder} cartons={cartons} reserved={{}} />
            {pallets && <PalletList readOnly order={packingOrder} cartons={cartons} pallets={pallets} />}
          </ShipmentLayout>
        ) : (
          <PackingForm
            renderHeader={(actions) => (
              <div className="flex flex-wrap items-center justify-between gap-3">
                {heading}
                {actions}
              </div>
            )}
            renderProductActions={productActions}
            renderSidebar={sidebar}
            onSubmitted={(completed) => {
              setPackingRecords((current) => ({
                ...current,
                [packing.id]: { shipment: packing, packing: completed }
              }))
              setPackingFinished(true)
            }}
            shipmentId="6a2d4f1e-0b3c-4d5e-8f7a-000000000001"
            shipmentName={`Shipment ${packing.id}`}
            revision={1}
            orderRevision={1}
            order={packingOrder}
            reserved={{}}
            initial={draft}
            addresses={pickupLocations}
            route={{ route: { stops, legs: [] }, buyer: "Harbor Goods", notes: transport }}
          />
        )}
      </div>
    )
  }
  return (
    <div className={pageLayout}>
      <header className="flex flex-col gap-3">
        <a
          href={reviewing || proposing ? "/orders/po38" : "/orders"}
          className="focus-ring flex w-fit items-center gap-2 rounded-sm text-meta text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {reviewing || proposing ? "PO38" : { supplier: "Orders", buyer: "Purchase orders" }[viewer]}
        </a>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={cn("flex flex-wrap items-center gap-3", reviewing && "max-sm:flex-col max-sm:items-start")}>
            <h1 className="text-2xl font-semibold">
              {reviewing ? (
                <>
                  <span className="sm:hidden">Review changes</span>
                  <span className="hidden sm:inline">PO38</span>
                </>
              ) : (
                "PO38"
              )}
            </h1>
            <StatusBadge
              tone={match(state)
                .with("accepted", "pending", "changes_requested", "rejected", () => "success" as const)
                .with("draft", "declined", () => "neutral" as const)
                .otherwise(() => "info" as const)}
            >
              {status}
            </StatusBadge>
          </div>
          {viewer === "supplier" && !reviewing && !proposing && (
            <p className="w-full text-muted-foreground sm:hidden">From Harbor Goods</p>
          )}
          <div className={cn("flex flex-wrap items-center gap-2", reviewing && !reviewOwn && "hidden sm:flex")}>
            {((reviewing && !reviewOwn) ||
              (state === "awaiting" && viewer === "supplier") ||
              (canConfirmPayment && paidAmount !== null) ||
              state === "draft") && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Order actions" />}>
                  <Ellipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48 whitespace-nowrap">
                  {canConfirmPayment && paidAmount !== null && (
                    <DropdownMenuItem onClick={() => setPaymentAction("unpaid")}>
                      <Banknote />
                      Mark as unpaid
                    </DropdownMenuItem>
                  )}
                  {reviewing && !reviewOwn && (
                    <DropdownMenuItem onClick={() => setAction("reject")}>Reject changes</DropdownMenuItem>
                  )}
                  {state === "awaiting" && viewer === "supplier" && (
                    <DropdownMenuItem onClick={() => setAction("decline")}>Decline order</DropdownMenuItem>
                  )}
                  {state === "draft" && (
                    <DropdownMenuItem onClick={() => setState("declined")}>
                      <Trash2 />
                      Delete draft
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {(state === "awaiting" || (reviewing && !reviewOwn)) && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (reviewing) {
                      setAction("request")
                    } else {
                      propose()
                    }
                  }}
                >
                  {reviewing ? "Request changes" : "Propose changes"}
                </Button>
                <Button
                  onClick={() => {
                    setFile(null)
                    setAction("accept")
                  }}
                >
                  Accept order
                </Button>
              </>
            )}
            {reviewing && reviewOwn && (
              <Button variant="outline" onClick={() => setState("pending")}>
                Back to order
              </Button>
            )}
            {state === "accepted" && (
              <Button variant="outline" onClick={propose}>
                Propose changes
              </Button>
            )}
            {proposing && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShipments(acceptedShipments)
                    setAdjustments(acceptedAdjustments)
                    setState(beforeProposing)
                    setEditing(null)
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={!hasProposalChanges || hasQuantityErrors} onClick={() => setAction("send")}>
                  Send for approval
                </Button>
              </>
            )}
            {state === "draft" && (
              <Button className="hidden sm:inline-flex" disabled={hasQuantityErrors} onClick={submitOrder}>
                Send order
              </Button>
            )}
          </div>
        </div>
        {proposing ? (
          <p className="text-muted-foreground">Propose changes to {recipient}</p>
        ) : (
          viewer === "supplier" &&
          !reviewing && <p className="hidden text-muted-foreground sm:block">From Harbor Goods</p>
        )}
      </header>
      {reviewing ? (
        <div className="grid min-w-0 items-start gap-6 @5xl/po:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex gap-3">
              <span className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-950 text-xs text-primary sm:flex">
                {reviewOwn ? "You" : { buyer: "ML", supplier: "AR" }[viewer]}
              </span>
              <div>
                <p className="font-medium">
                  {reviewOwn
                    ? "You"
                    : { buyer: "Maya at Northwind Textiles", supplier: "Alex at Harbor Goods" }[viewer]}
                </p>
                <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
                  October 15, 2026 at {viewer === "supplier" ? "1:10 PM" : "9:32 AM"}
                </p>
                <p className="mt-2">
                  {reviewOwn
                    ? proposalMessage
                    : match(change)
                        .with("removedAdjustment", () => "We can waive the handling charge.")
                        .with("quantity", () => "Please add 60 natural towels to Shipment 1.")
                        .with("both", () => "Please add 60 natural towels at $9.50 each.")
                        .with("products", () => "Replace the sage towels with cotton drawstring bags.")
                        .otherwise(
                          () => "The natural towel is now $9.50. Packing is $120 and handling is $25 for this order."
                        )}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{revisionCaption}</p>
            {changedProductIds.length > 0 && (
              <div className="flex flex-col gap-3 sm:gap-0 sm:overflow-hidden sm:rounded-lg sm:border">
                <div className="hidden grid-cols-[minmax(0,1fr)_6rem_7rem] gap-3 bg-muted sm:grid px-4 py-3 text-xs text-muted-foreground">
                  <span>Product</span>
                  <span className="text-end">Quantity</span>
                  <span className="text-end">Price</span>
                </div>
                {changedProductIds.map((id) => {
                  const before = beforeItems.find((item) => item.id === id)
                  const after = afterItems.find((item) => item.id === id)
                  const item = after ?? before
                  if (!item || (before?.pieces === after?.pieces && before?.unitPrice === after?.unitPrice)) {
                    return null
                  }
                  return (
                    <div
                      key={id}
                      className="grid grid-cols-2 items-center gap-4 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_6rem_7rem] sm:rounded-none sm:border-0 sm:border-t"
                    >
                      <div className="col-span-2 min-w-0 border-b pb-3 sm:col-span-1 sm:border-0 sm:pb-0">
                        <ProductIdentity item={item} showPackSize={false} />
                        {(!before || !after) && (
                          <Badge variant="secondary" className="mt-2">
                            {after ? "Added" : "Removed"}
                          </Badge>
                        )}
                      </div>
                      <div className="sm:text-end">
                        <span className="mb-1 block text-xs text-muted-foreground sm:hidden">Quantity</span>
                        <ValueChange before={before?.pieces ?? 0} after={after?.pieces ?? 0} />
                      </div>
                      <div className="sm:text-end">
                        <span className="mb-1 block text-xs text-muted-foreground sm:hidden">Price</span>
                        <ValueChange
                          before={before?.unitPrice ?? item.unitPrice}
                          after={after?.unitPrice ?? item.unitPrice}
                          price
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className={cn(changedAdjustmentIds.length > 0 && "overflow-hidden rounded-lg border")}>
              {changedAdjustmentIds.length > 0 && (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] gap-2 bg-muted px-4 py-3 text-xs text-muted-foreground">
                    <span>Adjustment</span>
                    <span className="text-end">Previous</span>
                    <span className="text-end">Proposed</span>
                  </div>
                  {changedAdjustmentIds.map((id) => {
                    const old = oldAdjustments.find((row) => row.id === id)
                    const next = newAdjustments.find((row) => row.id === id)
                    return (
                      <div
                        key={id}
                        className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-2 border-t p-4"
                      >
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span>{next?.name ?? old?.name}</span>
                        </span>
                        <span className="text-end text-muted-foreground">{old ? cash(old.amount) : "—"}</span>
                        <span className="text-end">
                          {next ? cash(next.amount) : <Badge variant="secondary">Removed</Badge>}
                        </span>
                      </div>
                    )
                  })}
                </>
              )}
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] gap-x-2 gap-y-3 border-t px-4 py-4 tabular-nums">
                {changedAdjustmentIds.length === 0 && (
                  <>
                    <span />
                    <span className="text-end text-xs text-muted-foreground">Previous</span>
                    <span className="text-end text-xs text-muted-foreground">Proposed</span>
                  </>
                )}
                {originalQuantity !== proposedQuantity && (
                  <>
                    <span>Total quantity</span>
                    <span className="text-end text-muted-foreground">{originalQuantity}</span>
                    <span className="text-end">{proposedQuantity}</span>
                  </>
                )}
                <span>Order total</span>
                <span className="text-end text-muted-foreground">{cash(originalTotal)}</span>
                <span className="text-end font-medium">{cash(proposedTotal)}</span>
              </div>
            </div>
            <section className="flex flex-col gap-3">
              <h2 className="hidden font-semibold sm:block">
                {viewer === "buyer" ? "Revised invoice" : "Current invoice"}
              </h2>
              <InvoiceRow
                name={change === "removedAdjustment" ? "Invoice-PO38-rev3.pdf" : "Invoice-PO38-rev2.pdf"}
                onView={viewInvoice}
              />
            </section>
            {!reviewOwn && (
              <div className="flex flex-col gap-2 sm:hidden">
                <Button
                  onClick={() => {
                    setFile(null)
                    setAction("accept")
                  }}
                >
                  Accept order
                </Button>
                <div className="flex gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Order actions" />}>
                      <Ellipsis />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => setAction("reject")}>Reject changes</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button className="flex-1" variant="outline" onClick={() => setAction("request")}>
                    Request changes
                  </Button>
                </div>
              </div>
            )}
          </div>
          <aside className="hidden flex-col gap-4 @5xl/po:flex">
            <h2 className="font-semibold">Summary</h2>
            <div>
              <p className="text-xs text-muted-foreground">Requested by</p>
              <p className="mt-1">{reviewOwn ? "You" : recipient}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Proposed total</p>
              <p className="mt-1 font-medium">{cash(proposedTotal)}</p>
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid min-w-0 items-start gap-6 [grid-template-areas:'shipments'_'aside'_'timeline'] @5xl/po:grid-cols-[minmax(0,1fr)_17rem] @5xl/po:[grid-template-areas:'shipments_aside'_'timeline_aside']">
          <div className="flex min-w-0 flex-col gap-8 [grid-area:shipments]">
            {["pending", "changes_requested", "rejected", "declined"].includes(state) && (
              <div className="flex flex-col gap-3 rounded-lg border p-4">
                <h2 className="font-semibold">
                  {match(state)
                    .with("pending", () => "Proposal sent")
                    .with("changes_requested", () => "Changes requested")
                    .with("rejected", () => "Changes rejected")
                    .otherwise(() => "Order declined")}
                </h2>
                <p>
                  {match(state)
                    .with("pending", () => `${recipient} is reviewing revision ${revision}.`)
                    .with("changes_requested", () =>
                      proposalAuthor
                        ? "We can add 48 natural towels, not 60. Please revise the quantity to 288."
                        : `Waiting for ${recipient} to revise the proposal.`
                    )
                    .with("rejected", () => "The accepted order stays unchanged.")
                    .otherwise(() => "This order was declined.")}
                </p>
                {(state === "rejected" || state === "declined") && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {viewer === "supplier" ? "Maya at Northwind Textiles" : "Alex at Harbor Goods"} / October 15, 2026
                      at 2:15 PM
                    </p>
                    {state === "rejected" && <p>Revision {revision}</p>}
                    {decisionReason && <p className="whitespace-pre-wrap">{decisionReason}</p>}
                    <div className="flex justify-between gap-3 border-t pt-3">
                      <span>{state === "rejected" ? "Accepted total" : "Order total"}</span>
                      <strong>{cash(acceptedTotal)}</strong>
                    </div>
                  </div>
                )}
                {state === "pending" && (
                  <p className="text-muted-foreground">
                    Accepted total {cash(total)}. Proposed total{" "}
                    {cash(
                      proposal
                        ? orderSubtotal(proposal.shipments.flatMap((shipment) => shipment.items)) +
                            proposal.adjustments.reduce((sum, row) => sum + row.amount, 0)
                        : proposedTotal
                    )}
                    .
                  </p>
                )}
                {["pending", "changes_requested"].includes(state) && proposalAuthor && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (state === "pending") {
                          setReviewOwn(true)
                          setState("review")
                        } else {
                          if (proposal) {
                            setShipments(proposal.shipments)
                            setAdjustments(proposal.adjustments)
                          }
                          setState("proposing")
                        }
                      }}
                    >
                      {state === "pending" ? "View proposal" : "Revise proposal"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setState("accepted")
                        setShipments(acceptedShipments)
                        setAdjustments(acceptedAdjustments)
                        setProposal(null)
                        recordEvent("You withdrew the proposal.")
                      }}
                    >
                      Withdraw proposal
                    </Button>
                  </div>
                )}
              </div>
            )}
            {shipments.map((shipment) => {
              const editable = editing === shipment.id || proposing
              const itemColumns = editable
                ? "@lg/shipment:grid-cols-[minmax(0,1fr)_5rem_5rem_9.5rem_4.5rem_1.75rem] @3xl/shipment:grid-cols-[minmax(0,1fr)_6.5rem_5rem_12.5rem_5.5rem_1.75rem]"
                : "@lg/shipment:grid-cols-[minmax(0,1fr)_6rem_5rem_8rem_5rem_1.75rem] @3xl/shipment:grid-cols-[minmax(0,1fr)_7rem_5rem_10rem_5.5rem_1.75rem]"
              return (
                <section
                  key={shipment.id}
                  aria-label={`Shipment ${shipment.id}`}
                  className="@container/shipment flex min-w-0 flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">Shipment {shipment.id}</h2>
                    {accepted && state === "accepted" && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPackingFinished(Boolean(packingRecords[shipment.id]))
                          setPacking(shipment)
                        }}
                      >
                        View shipment
                      </Button>
                    )}
                  </div>
                  <div className="overflow-hidden rounded-xl border">
                    <div className="relative flex items-start gap-2 border-b bg-muted/40 p-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-3 @lg/shipment:flex-row @lg/shipment:flex-wrap @lg/shipment:items-center @lg/shipment:gap-2">
                        <span className="inline-flex items-center gap-2">
                          <Factory className="hidden size-4 shrink-0 @lg/shipment:block" />
                          Northwind Textiles
                        </span>
                        {shipment.stop && (
                          <>
                            <ArrowRight className="hidden size-4 text-muted-foreground @lg/shipment:block" />
                            <span className="inline-flex items-center gap-2">
                              <CornerDownRight className="size-4 text-muted-foreground @lg/shipment:hidden" />
                              {shipment.stopKey === "warehouse" ? (
                                <MapPin className="hidden size-4 @lg/shipment:block" />
                              ) : (
                                <Ship className="hidden size-4 @lg/shipment:block" />
                              )}
                              {receivingStop(shipment).name}
                            </span>
                            <span className="text-xs text-muted-foreground @lg/shipment:hidden">
                              {shipment.firstLeg?.endsWith("pickup")
                                ? `${shipment.firstLeg} from Northwind Textiles`
                                : `Supplier ships to ${receivingStop(shipment).location}`}
                            </span>
                          </>
                        )}
                        <ArrowRight className="hidden size-4 text-muted-foreground @lg/shipment:block" />
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <CornerDownRight className="size-4 shrink-0 text-muted-foreground @lg/shipment:hidden" />
                          <MapPin className="hidden size-4 shrink-0 @lg/shipment:block" />
                          {editable && viewer === "buyer" ? (
                            <SelectChoice
                              label={`Shipment ${shipment.id} destination`}
                              value={shipment.destination}
                              options={["Amazon FBA", "Amazon AWD US", "Oakland warehouse"]}
                              onChange={(destination) =>
                                updateShipment(shipment.id, {
                                  destination,
                                  transport: `${onwardShipper(shipment)} ships`
                                })
                              }
                            />
                          ) : (
                            shipment.destination
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground @lg/shipment:hidden">
                          {shipment.transport === "Amazon pickup"
                            ? `Amazon pickup from ${shipment.stop ? receivingStop(shipment).name : "Northwind Textiles"}`
                            : `${onwardShipper(shipment)} ships to ${shipment.destination}`}
                        </span>
                      </div>
                      {canEdit && viewer === "buyer" && (
                        <div className="ms-auto flex shrink-0 gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button variant="ghost" size="icon-sm" aria-label={`Shipment ${shipment.id} actions`} />
                              }
                            >
                              <Ellipsis />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-44 whitespace-nowrap">
                              {editable && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setStopDraft({
                                      stopKey: shipment.stopKey ?? "forwarder",
                                      firstLeg: shipment.firstLeg ?? "Supplier ships",
                                      transport: shipment.transport
                                    })
                                    setStopFor(shipment.id)
                                  }}
                                >
                                  <Plus />
                                  {shipment.stop ? "Edit stop" : "Add stop"}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => {
                                  if (shipment.items.length) {
                                    setDeletingShipment(shipment)
                                  } else {
                                    deleteShipment(shipment.id)
                                  }
                                }}
                              >
                                <Trash2 />
                                Delete shipment
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {editable ? (
                            !proposing && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setShipments(savedShipments)
                                    setEditing(null)
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={shipment.items.some((item) => quantityError(item))}
                                  onClick={() => setEditing(null)}
                                >
                                  Done
                                </Button>
                              </>
                            )
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSavedShipments(shipments)
                                setEditing(shipment.id)
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <div
                      className={cn(
                        "flex flex-col gap-2 border-b px-4 py-3 text-xs",
                        !editable && "hidden @lg/shipment:flex"
                      )}
                    >
                      {shipment.stop && (
                        <div className="flex items-center gap-2">
                          <Truck className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {shipment.firstLeg?.endsWith("pickup")
                              ? `${shipment.firstLeg} from Northwind Textiles`
                              : `Supplier ships to ${receivingStop(shipment).location}`}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Truck className="size-3.5 shrink-0 text-muted-foreground" />
                        {editable && viewer === "buyer" && shipment.destination.startsWith("Amazon") ? (
                          <div className="max-w-64">
                            <SelectChoice
                              label={`Shipment ${shipment.id} transport`}
                              value={shipment.transport}
                              options={[`${onwardShipper(shipment)} ships`, "Amazon pickup"]}
                              onChange={(transport) => updateShipment(shipment.id, { transport })}
                            />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            {shipment.transport === "Amazon pickup"
                              ? `Amazon pickup from ${shipment.stop ? receivingStop(shipment).name : "Northwind Textiles"}`
                              : `${onwardShipper(shipment)} ships to ${shipment.destination}`}
                          </span>
                        )}
                      </div>
                    </div>
                    {viewer === "supplier" && shipment.stop && (
                      <address className="border-b px-4 py-3 text-xs not-italic">
                        <p className="font-medium">
                          Ship to {receivingStop(shipment).name} / {receivingStop(shipment).location}
                        </p>
                        <p className="mt-1 text-muted-foreground">{receivingStop(shipment).address}</p>
                      </address>
                    )}
                    <div
                      className={cn(
                        "hidden gap-1 bg-muted px-2 py-2 text-xs text-muted-foreground @lg/shipment:grid @3xl/shipment:gap-2 @3xl/shipment:px-3",
                        itemColumns
                      )}
                    >
                      <span>Product</span>
                      <span>Supplier SKU</span>
                      <span className={cn("text-end", editable && "pe-2")}>Quantity</span>
                      <div className="grid grid-cols-1 gap-2 text-end @3xl/shipment:grid-cols-[minmax(0,1fr)_5rem]">
                        <span className={cn(editable && "pe-9")}>Cost</span>
                        <span className="hidden @3xl/shipment:block">Tax</span>
                      </div>
                      <span className="text-end">Total</span>
                      <span className="sr-only">Actions</span>
                    </div>
                    {shipment.items.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "grid grid-cols-3 items-start gap-3 border-t p-4 @lg/shipment:gap-1 @lg/shipment:px-2 @3xl/shipment:gap-2 @3xl/shipment:px-3",
                          itemColumns
                        )}
                      >
                        <div
                          className={cn(
                            "col-span-3 col-start-1 row-start-1 min-w-0 @lg/shipment:col-span-1 @lg/shipment:col-auto @lg/shipment:row-auto",
                            "pe-10 @lg/shipment:pe-0"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <img
                              src={
                                productImages[
                                  Math.max(
                                    0,
                                    products.findIndex((product) => product.id === item.id)
                                  )
                                ]
                              }
                              alt=""
                              className="hidden size-10 shrink-0 rounded-md border object-cover @3xl/shipment:block"
                            />
                            <ProductIdentity item={item} showPackSize={false} />
                          </div>
                        </div>
                        <div className="col-span-3 min-w-0 wrap-anywhere @lg/shipment:col-span-1">
                          <span className="mb-1 block text-xs text-muted-foreground @lg/shipment:hidden">
                            Supplier SKU
                          </span>
                          {editable ? (
                            <Input
                              aria-label={`${item.buyerSku} supplier SKU`}
                              className="px-2"
                              value={item.supplierSku}
                              onChange={(event) => updateItem(shipment, item.id, { supplierSku: event.target.value })}
                            />
                          ) : (
                            <p>{item.supplierSku}</p>
                          )}
                        </div>
                        <div className="min-w-0 text-end tabular-nums">
                          <span
                            className={cn(
                              "mb-1 block text-xs text-muted-foreground @lg/shipment:hidden",
                              editable && "pe-2"
                            )}
                          >
                            Quantity
                          </span>
                          <QuantityDisplay pieces={item.pieces} packSize={item.piecesPerSet}>
                            {editable ? (
                              <QuantityInput
                                item={item}
                                shipmentId={shipment.id}
                                onChange={(pieces) => updateItem(shipment, item.id, { pieces })}
                              />
                            ) : (
                              <span>
                                {item.pieces}
                                <span className="ms-2 text-xs text-muted-foreground @lg/shipment:hidden">pcs</span>
                              </span>
                            )}
                            {editable && quantityError(item) && (
                              <output
                                id={`quantity-error-${shipment.id}-${item.id}`}
                                className="mt-1 block text-xs text-destructive"
                              >
                                {quantityError(item)}
                              </output>
                            )}
                          </QuantityDisplay>
                        </div>
                        <div className="min-w-0 text-end tabular-nums">
                          <span
                            className={cn(
                              "mb-1 block text-xs text-muted-foreground @lg/shipment:hidden",
                              editable && "pe-9"
                            )}
                          >
                            Cost
                          </span>
                          <div className="grid grid-cols-1 items-start gap-3 @3xl/shipment:grid-cols-[minmax(0,1fr)_5rem] @3xl/shipment:gap-2">
                            {editable ? (
                              // The popover wraps the group, so its content isn't inside the addon, which focuses the
                              // input on a click.
                              <Popover>
                                <InputGroup className="min-w-0 flex-1">
                                  <InputGroupAddon>$</InputGroupAddon>
                                  <PriceInput
                                    value={item.unitPrice}
                                    label={`${item.buyerSku} cost`}
                                    onChange={(unitPrice) => {
                                      updateItem(shipment, item.id, { unitPrice })
                                      setCostSources((current) => ({ ...current, [item.id]: "Custom cost" }))
                                    }}
                                  />
                                  <InputGroupAddon align="inline-end">
                                    <PopoverTrigger
                                      render={
                                        <InputGroupButton size="icon-xs" aria-label={`${item.buyerSku} cost source`} />
                                      }
                                    >
                                      <ChevronDown />
                                    </PopoverTrigger>
                                  </InputGroupAddon>
                                </InputGroup>
                                <PopoverContent className="w-80" align="end">
                                  <RadioGroup
                                    aria-label="Cost source"
                                    value={costSources[item.id] ?? "Supplier purchase price"}
                                    onValueChange={(value) => {
                                      if (value) {
                                        setCostSources((current) => ({ ...current, [item.id]: value }))
                                        if (value !== "Custom cost") {
                                          updateItem(shipment, item.id, {
                                            unitPrice:
                                              value === "Cost per item"
                                                ? 950
                                                : (products.find((product) => product.id === item.id)?.unitPrice ??
                                                  item.unitPrice)
                                          })
                                        }
                                      }
                                    }}
                                  >
                                    {["Cost per item", "Supplier purchase price", "Custom cost"].map((source) => (
                                      <label
                                        key={source}
                                        htmlFor={`${controlId}-${item.id}-${source.replaceAll(" ", "-")}`}
                                        className="flex items-start gap-3 rounded p-2"
                                      >
                                        <RadioGroupItem
                                          id={`${controlId}-${item.id}-${source.replaceAll(" ", "-")}`}
                                          value={source}
                                        />
                                        <span>
                                          <span className="inline-flex flex-wrap items-center gap-2">
                                            {source}
                                            {source !== "Custom cost" && (
                                              <Badge variant="secondary">
                                                {cash(
                                                  source === "Cost per item"
                                                    ? 950
                                                    : (products.find((product) => product.id === item.id)?.unitPrice ??
                                                        item.unitPrice)
                                                )}
                                              </Badge>
                                            )}
                                          </span>
                                          <span className="mt-1 block text-xs text-muted-foreground">
                                            {match(source)
                                              .with("Cost per item", () => "From product details")
                                              .with("Supplier purchase price", () => (
                                                <>
                                                  Last ordered from Northwind Textiles on{" "}
                                                  <a className="underline" href="/orders/po31">
                                                    #PO31
                                                  </a>
                                                </>
                                              ))
                                              .otherwise(
                                                () => "Once agreed, the default for your next order from this supplier"
                                              )}
                                          </span>
                                        </span>
                                      </label>
                                    ))}
                                  </RadioGroup>
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <span>{cash(item.unitPrice)}</span>
                            )}
                            <div className="w-full min-w-0 justify-self-end @lg/shipment:max-w-20">
                              <label
                                htmlFor={`${controlId}-${shipment.id}-${item.id}-tax`}
                                className="mb-1 block text-xs text-muted-foreground @3xl/shipment:hidden"
                              >
                                Tax
                              </label>
                              {editable ? (
                                <TaxInput
                                  id={`${controlId}-${shipment.id}-${item.id}-tax`}
                                  label={`${item.buyerSku} tax percent`}
                                  taxRate={item.taxRate ?? 0}
                                  onChange={(taxRate) => updateItem(shipment, item.id, { taxRate })}
                                />
                              ) : (
                                <span>{item.taxRate ?? 0}%</span>
                              )}
                            </div>
                          </div>
                          {proposing &&
                            acceptedShipments.flatMap((group) => group.items).find((row) => row.id === item.id)
                              ?.unitPrice !== item.unitPrice && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Was{" "}
                                {cash(
                                  acceptedShipments.flatMap((group) => group.items).find((row) => row.id === item.id)
                                    ?.unitPrice ?? item.unitPrice
                                )}
                              </p>
                            )}
                        </div>
                        <div className={cn("min-w-0 text-end tabular-nums", editable && "@lg/shipment:pt-2")}>
                          <span className="mb-1 block text-xs text-muted-foreground @lg/shipment:hidden">Total</span>
                          {cash(item.pieces * item.unitPrice)}
                        </div>
                        <div className="col-start-3 row-start-1 flex flex-col gap-1 justify-self-end @lg/shipment:col-auto @lg/shipment:row-auto">
                          <ProductDownloadsMenu
                            productName={item.supplierSku || item.buyerSku}
                            items={productDownloads([item])}
                            busy={downloadingPacking}
                            onDownload={(ids) =>
                              void downloadProductLabels([item], ids, item.supplierSku || item.buyerSku)
                            }
                          />
                          {editable && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${item.buyerSku}`}
                              onClick={() =>
                                updateShipment(shipment.id, {
                                  items: shipment.items.filter((row) => row.id !== item.id)
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                        {(editable || viewer === "supplier") && (
                          <Button
                            className="col-span-3 mt-1 h-auto justify-self-start gap-1 p-0 text-xs text-muted-foreground hover:bg-transparent @lg/shipment:col-span-1 @lg/shipment:col-start-1 @3xl/shipment:ms-13"
                            variant="ghost"
                            onClick={() => setPackingDetails(item)}
                          >
                            Packing details
                            <ChevronRight aria-hidden className="size-3 rtl:rotate-180" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <div
                      className={cn(
                        "grid grid-cols-[1fr_auto_auto] items-baseline gap-3 border-t p-4 font-medium tabular-nums @lg/shipment:gap-1 @lg/shipment:px-2 @3xl/shipment:gap-2 @3xl/shipment:px-3",
                        itemColumns
                      )}
                    >
                      <span>Subtotal</span>
                      <span className={cn("text-end whitespace-nowrap @lg/shipment:col-span-2", editable && "pe-2")}>
                        {shipment.items.reduce((sum, item) => sum + item.pieces, 0)} items
                      </span>
                      <span className="text-end @lg/shipment:col-start-5">{cash(orderSubtotal(shipment.items))}</span>
                    </div>
                    {editable && (
                      <div className="flex items-center gap-2 border-t p-3">
                        <AddProductsDialog
                          title={`Add products to Shipment ${shipment.id}`}
                          addLabel={`Add to Shipment ${shipment.id}`}
                          description={`${shipment.destination}${shipment.stop ? ` via ${receivingStop(shipment).name}` : ""}`}
                          added={new Set(allItems.map((item) => item.variantId))}
                          stockAt={{ locationIds: ["amazon:fba", "amazon:awd"], label: "At destination" }}
                          onAdd={(added) =>
                            updateShipment(shipment.id, {
                              items: [
                                ...shipment.items,
                                ...added.map((product) =>
                                  orderLine(product, crypto.randomUUID(), product.lineDefaults, "USD")
                                )
                              ]
                            })
                          }
                        />
                        <FutureButton label="Scan products">
                          <ScanBarcode />
                        </FutureButton>
                        <FutureButton label="Import products">
                          <Upload />
                        </FutureButton>
                      </div>
                    )}
                  </div>
                </section>
              )
            })}
            {canEdit && !proposing && (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => {
                  const id = String(Math.max(0, ...shipments.map((shipment) => Number(shipment.id))) + 1)
                  setShipments([
                    ...shipments,
                    { id, destination: "Amazon FBA", stop: false, transport: "Supplier ships", items: [] }
                  ])
                  setEditing(id)
                }}
              >
                <Plus />
                Add shipment
              </Button>
            )}
            {proposing && (
              <label htmlFor={`${controlId}-reason`} className="flex flex-col gap-2 font-medium">
                Reason for changes
                <Textarea
                  id={`${controlId}-reason`}
                  value={proposalMessage}
                  onChange={(event) => setProposalMessage(event.target.value)}
                />
              </label>
            )}
          </div>
          <aside className="flex min-w-0 flex-col gap-6 [grid-area:aside]">
            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-semibold">Cost summary</h2>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edit cost summary"
                    onClick={() => {
                      setAdjustmentDraft(adjustments)
                      setAdjusting(true)
                    }}
                  >
                    <Pencil />
                  </Button>
                )}
              </div>
              <dl className="space-y-3">
                <div className="flex justify-between gap-3">
                  <dt>{allItems.reduce((sum, item) => sum + item.pieces, 0)} items</dt>
                  <dd>{cash(subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Taxes (Included)</dt>
                  <dd>{cash(includedTax)}</dd>
                </div>
                {adjustments.map((row) => (
                  <div key={row.id} className="flex justify-between gap-3">
                    <dt>{row.name}</dt>
                    <dd>{cash(row.amount)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t pt-3 font-semibold">
                  <dt>Total</dt>
                  <dd>{cash(total)}</dd>
                </div>
                {proposing && (
                  <>
                    <div className="flex justify-between gap-3 text-muted-foreground">
                      <dt>Original total</dt>
                      <dd>{cash(acceptedTotal)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>{total >= acceptedTotal ? "Increase" : "Decrease"}</dt>
                      <dd>{cash(Math.abs(total - acceptedTotal))}</dd>
                    </div>
                  </>
                )}
              </dl>
              {state !== "draft" && !proposing && (
                <section aria-label="Payment" className="mt-4 space-y-2 border-t pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Payment</span>
                    <StatusBadge tone={paid ? "success" : "neutral"}>{paymentStatus}</StatusBadge>
                    {canConfirmPayment && !paid && (
                      <Button variant="outline" size="sm" className="ms-auto" onClick={() => setPaymentAction("paid")}>
                        Mark as paid
                      </Button>
                    )}
                  </div>
                  {paidAmount !== null && !paid && (
                    <p className="text-xs text-muted-foreground">Balance due {cash(total - paidAmount)}</p>
                  )}
                </section>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  className="mt-3 p-0"
                  onClick={() => {
                    setAdjustmentDraft([...adjustments, { id: crypto.randomUUID(), name: "", amount: 0 }])
                    setAdjusting(true)
                  }}
                >
                  <Plus />
                  Add adjustment
                </Button>
              )}
            </section>
            {accepted && (
              <section className="flex flex-col gap-3">
                <h2 className="font-semibold">Invoice</h2>
                <InvoiceRow name="Invoice-PO38.pdf" onView={viewInvoice} />
              </section>
            )}
            {accepted && (
              <section aria-label="Purchase order documents" className="space-y-3">
                <h2 className="font-semibold">Documents</h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={downloadingPacking} onClick={() => void downloadSupplierPack()}>
                    <Download />
                    Download supplier pack
                  </Button>
                  <ProductDownloadsMenu
                    busy={downloadingPacking}
                    items={productDownloads(shipments.flatMap((shipment) => shipment.items))}
                    onDownload={(ids) =>
                      void downloadProductLabels(
                        shipments.flatMap((shipment) => shipment.items),
                        ids,
                        "Order"
                      )
                    }
                  />
                </div>
                {!labelsReady && (
                  <p className="text-xs text-muted-foreground">
                    Includes available documents. Shipment labels are pending.
                  </p>
                )}
              </section>
            )}
            {!proposing && (
              <section className="flex flex-col gap-4 border-t pt-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">Purchase order details</h2>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit purchase order details"
                      onClick={() => {
                        setDetailsDraft(details)
                        setDetailsOpen(true)
                      }}
                    >
                      <Pencil />
                    </Button>
                  )}
                </div>
                <DetailFields
                  items={[
                    {
                      label: viewer === "supplier" ? "Customer" : "Supplier",
                      value: viewer === "supplier" ? "Harbor Goods" : "Northwind Textiles"
                    },
                    { label: "Date created", value: "Oct 15, 2026" },
                    { label: "Reference number", value: details.reference || "None" },
                    {
                      label: viewer === "supplier" ? "Note from buyer" : "Note to supplier",
                      value: <Markdown>{details.notes}</Markdown>
                    }
                  ]}
                />
                <DetailFields
                  className="grid-cols-2 border-t pt-4"
                  items={[
                    { label: "Terms", value: details.terms },
                    { label: "Currency", value: "USD $" }
                  ]}
                />
              </section>
            )}
          </aside>
          {!proposing && (
            <div className="flex flex-col gap-4 border-t pt-6 [grid-area:timeline]">
              <PoTimeline
                orderId={orderId}
                viewerOrg={viewer === "buyer" ? "Harbor Goods" : "Northwind Textiles"}
                counterparty={viewer === "buyer" ? "supplier" : "customer"}
                timeZone="UTC"
                prices
                onCommentPosted={(comment) =>
                  setComments((current) => [
                    {
                      key: crypto.randomUUID(),
                      at: new Date("2026-10-15T14:16:00Z"),
                      content: comment.message,
                      comment: true,
                      author: viewer === "buyer" ? "Alex Rivera" : "Maya Liu",
                      authorOrg: viewer === "buyer" ? "Harbor Goods" : "Northwind Textiles",
                      visibility: comment.visibility,
                      revision: null,
                      revisionNumber: null
                    },
                    ...current
                  ])
                }
                entries={[
                  ...comments,
                  ...[
                    ...events,
                    ...(["accepted", "pending", "rejected", "changes_requested"].includes(initialState)
                      ? [{ text: "The supplier accepted the order.", time: "9:45 AM" }]
                      : [])
                  ].map((event, index) => timelineEvent(`event-${index}`, event.text, event.time)),
                  ...(timelineExample
                    ? [
                        {
                          ...timelineEvent("revision-2", "Northwind Textiles proposed changes.", "9:32 AM"),
                          details: (
                            <div className="space-y-3 py-3">
                              {" "}
                              <div className="flex justify-between">
                                <span>Packing</span>
                                <span>+{cash(12000)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Handling</span>
                                <span>+{cash(2500)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Order total</span>
                                <span>
                                  {cash(435600)} → {cash(450100)}
                                </span>
                              </div>
                              <InvoiceRow name="Invoice-PO38-rev2.pdf" onView={viewInvoice} />
                            </div>
                          )
                        },
                        {
                          ...timelineEvent(
                            "supplier-comment",
                            "Packing is $120 and handling is $25 for this order. The revised invoice includes both charges.",
                            "9:30 AM"
                          ),
                          comment: true,
                          author: "Maya",
                          authorOrg: "Northwind Textiles",
                          visibility: "shared"
                        } satisfies TimelineEntry
                      ]
                    : []),
                  timelineEvent(
                    "created",
                    viewer === "supplier"
                      ? "Harbor Goods sent you this purchase order."
                      : "You created this purchase order.",
                    "9:15 AM"
                  ),
                  ...(timelineExample && earlierActivity
                    ? [
                        timelineEvent(
                          "sent-earlier",
                          "You sent this purchase order to Northwind Textiles.",
                          "4:15 PM",
                          14
                        ),
                        timelineEvent("created-earlier", "You created this purchase order.", "4:00 PM", 14)
                      ]
                    : [])
                ]}
              />
              {timelineExample && (
                <Button variant="outline" className="self-start" onClick={() => setEarlierActivity(!earlierActivity)}>
                  {earlierActivity ? "Hide earlier activity" : "Show earlier activity"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {state === "draft" && (
        <Button className="w-full sm:hidden" disabled={hasQuantityErrors} onClick={submitOrder}>
          Send order
        </Button>
      )}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Purchase order details</DialogTitle>
            <DialogDescription className="sr-only">Reference, instructions and payment terms</DialogDescription>
          </DialogHeader>
          <label htmlFor={`${controlId}-reference-number`} className="space-y-2">
            Reference number
            <Input
              id={`${controlId}-reference-number`}
              value={detailsDraft.reference}
              onChange={(event) => setDetailsDraft({ ...detailsDraft, reference: event.target.value })}
            />
          </label>
          <label htmlFor={`${controlId}-note-to-supplier`} className="space-y-2">
            Note to supplier
            <Textarea
              id={`${controlId}-note-to-supplier`}
              value={detailsDraft.notes}
              onChange={(event) => setDetailsDraft({ ...detailsDraft, notes: event.target.value })}
            />
          </label>
          <div className="space-y-2">
            Terms
            <SelectChoice
              label="Payment terms"
              value={detailsDraft.terms}
              options={["Due on receipt", "Net 15", "Net 30", "Net 60"]}
              onChange={(terms) => setDetailsDraft({ ...detailsDraft, terms })}
            />
          </div>
          <DialogFooter className={dialogFooterClass}>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setDetails(detailsDraft)
                setDetailsOpen(false)
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={paymentAction !== null} onOpenChange={(open) => !open && setPaymentAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{paymentAction === "unpaid" ? "Mark as unpaid?" : "Mark as paid?"}</DialogTitle>
            <DialogDescription>
              {paymentAction === "unpaid"
                ? "Correct the payment status for PO38. This does not issue a refund."
                : `Confirm you received ${cash(Math.max(0, total - (paidAmount ?? 0)))} from Harbor Goods for PO38.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className={dialogFooterClass}>
            <Button variant="outline" onClick={() => setPaymentAction(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const markPaid = paymentAction === "paid"
                setPaidAmount(markPaid ? total : null)
                recordEvent(
                  markPaid
                    ? `Maya at Northwind Textiles marked ${cash(total)} as paid.`
                    : "Maya at Northwind Textiles marked the order as unpaid."
                )
                setPaymentAction(null)
              }}
            >
              {paymentAction === "unpaid" ? "Mark as unpaid" : "Mark as paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAction(null)
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {
                {
                  send: "Send changes for approval",
                  request: "Request changes",
                  reject: "Reject changes?",
                  decline: "Decline order?",
                  accept: "Accept order"
                }[action ?? "accept"]
              }
            </DialogTitle>
            <DialogDescription>
              {match(action)
                .with("reject", () => "The accepted order stays unchanged.")
                .with("decline", () => "Harbor Goods will be notified.")
                .with("request", () => `Tell ${recipient} what needs to change.`)
                .with("send", () => `${recipient} will review your proposed changes.`)
                .otherwise(() =>
                  reviewing
                    ? `Accept revision ${revision} of PO38 from ${recipient}.`
                    : `Accept PO38 from ${recipient}.`
                )}
            </DialogDescription>
          </DialogHeader>
          {(action === "accept" || action === "send") && (
            <div className="flex justify-between gap-4">
              <span>Order total</span>
              <strong>{cash(reviewTotal)}</strong>
            </div>
          )}
          {needsInvoice && (
            <>
              <RadioGroup
                aria-label="Invoice source"
                value={invoiceMode}
                onValueChange={(value) => {
                  if (value) {
                    setInvoiceMode(value)
                  }
                }}
                className="flex flex-wrap gap-5"
              >
                {["generate", "upload"].map((value) => (
                  <label key={value} className="flex items-center gap-2">
                    <RadioGroupItem value={value} />
                    {value === "generate" ? "Generate invoice" : "Upload invoice"}
                  </label>
                ))}
              </RadioGroup>
              {invoiceMode === "generate" ? (
                <InvoiceRow name={invoiceName} onView={viewInvoice} />
              ) : (
                <FileDropzone accept={pdfFiles} maxBytes={32 * 1024 * 1024} file={file} onFileChange={setFile}>
                  {file && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url = URL.createObjectURL(file)
                        window.open(url, "_blank", "noopener,noreferrer")
                        setTimeout(() => URL.revokeObjectURL(url), 60000)
                      }}
                    >
                      View
                    </Button>
                  )}
                </FileDropzone>
              )}
            </>
          )}
          {action === "send" && viewer === "buyer" && (
            <p className="text-muted-foreground">Your supplier provides the updated invoice.</p>
          )}
          {["request", "reject", "decline"].includes(action ?? "") && (
            <label className="flex flex-col gap-2">
              {action === "request" ? "Message" : "Reason (optional)"}
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          )}
          <DialogFooter className={dialogFooterClass}>
            <Button variant="outline" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              disabled={(needsInvoice && invoiceMode === "upload" && !file) || (action === "request" && !reason.trim())}
              onClick={finish}
            >
              {actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Invoice preview</DialogTitle>
            <DialogDescription>{invoiceName}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border p-6">
            <h2 className="text-xl font-semibold">Northwind Textiles</h2>
            <p className="mt-2">Invoice / PO38</p>
            <p className="mt-4">Bill to Harbor Goods</p>
            <div className="mt-6 flex justify-between border-t pt-4">
              <span>Total</span>
              <strong>{cash(reviewTotal)}</strong>
            </div>
          </div>
          <span className="sr-only">{invoiceGenerated ? "Preview generated from the current order" : ""}</span>
        </DialogContent>
      </Dialog>
      <Dialog
        open={packingDetails !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPackingDetails(null)
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Packing details</DialogTitle>
            <DialogDescription className="sr-only">Product preparation and labels</DialogDescription>
          </DialogHeader>
          {packingDetails && (
            <>
              <ProductIdentity item={packingDetails} />
              {!canEdit ? (
                <>
                  <dl className="grid gap-4">
                    {[
                      ["Pack size", `${packingDetails.piecesPerSet} per pack`],
                      [
                        "Preparation",
                        preparationOptions.find((option) => option.value === requirement.preparation)?.label
                      ],
                      [
                        "Labels",
                        <ul key="labels" className="space-y-1">
                          {packingLabelOptions
                            .filter((option) => requirement.labels.includes(option.value))
                            .map((option) => (
                              <li key={option.value}>{option.label}</li>
                            ))}
                        </ul>
                      ],
                      ["Instructions", requirement.instructions]
                    ].map(([label, value], index) => (
                      <div key={index}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <DialogFooter className={dialogFooterClass}>
                    <Button variant="outline" onClick={() => setPackingDetails(null)}>
                      Close
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <label htmlFor={`${controlId}-preparation`} className="flex flex-col gap-2">
                    Preparation
                    <SelectControl
                      id={`${controlId}-preparation`}
                      options={[...preparationOptions]}
                      value={requirement.preparation}
                      onValueChange={(value) => {
                        const option = preparationOptions.find((option) => option.value === value)
                        if (option) {
                          updateRequirement({ preparation: option.value })
                        }
                      }}
                    />
                  </label>
                  {packingLabelOptions.map((option) => (
                    <label key={option.value} className="flex items-center gap-3">
                      <Checkbox
                        checked={requirement.labels.includes(option.value)}
                        onCheckedChange={(checked) =>
                          updateRequirement({
                            labels: checked
                              ? [...requirement.labels, option.value]
                              : requirement.labels.filter((label) => label !== option.value)
                          })
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                  <label htmlFor={`${controlId}-instructions`} className="flex flex-col gap-2">
                    Instructions
                    <Textarea
                      id={`${controlId}-instructions`}
                      value={requirement.instructions}
                      onChange={(event) => updateRequirement({ instructions: event.target.value })}
                    />
                  </label>
                  <DialogFooter className={dialogFooterClass}>
                    <Button onClick={() => setPackingDetails(null)}>Done</Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={stopFor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setStopFor(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {shipments.find((shipment) => shipment.id === stopFor)?.stop ? "Edit stop" : "Add stop"}
            </DialogTitle>
            <DialogDescription className="sr-only">Receiving stop and transport for each leg</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p>Stop type</p>
            <SelectChoice
              label="Stop type"
              value={receivingStops[stopDraft.stopKey].kind}
              options={["Freight forwarder", "Receiving address"]}
              onChange={(kind) =>
                setStopDraft({
                  stopKey: kind === "Freight forwarder" ? "forwarder" : "warehouse",
                  firstLeg: "Supplier ships",
                  transport: shipments.find((shipment) => shipment.id === stopFor)?.destination.startsWith("Amazon")
                    ? "Amazon pickup"
                    : `${kind === "Freight forwarder" ? "Forwarder" : "Buyer"} ships`
                })
              }
            />
          </div>
          <div className="space-y-2">
            <p>{stopDraft.stopKey === "forwarder" ? "Freight forwarder" : "Company"}</p>
            <SelectChoice
              label={stopDraft.stopKey === "forwarder" ? "Freight forwarder" : "Company"}
              value={receivingStops[stopDraft.stopKey].name}
              options={[receivingStops[stopDraft.stopKey].name]}
              onChange={() => undefined}
            />
          </div>
          <div className="space-y-2">
            <p>Receiving location</p>
            <SelectChoice
              label="Receiving location"
              value={receivingStops[stopDraft.stopKey].location}
              options={[receivingStops[stopDraft.stopKey].location]}
              onChange={() => undefined}
            />
          </div>
          <p className="text-muted-foreground">{receivingStops[stopDraft.stopKey].address}</p>
          <div className="space-y-2">
            <span>Supplier to receiving location</span>
            <SelectChoice
              label="Supplier to receiving location"
              value={stopDraft.firstLeg}
              options={
                stopDraft.stopKey === "forwarder"
                  ? ["Supplier ships", "Forwarder pickup"]
                  : ["Supplier ships", "Buyer pickup"]
              }
              onChange={(firstLeg) => setStopDraft({ ...stopDraft, firstLeg })}
            />
          </div>
          <div className="space-y-2">
            <span>Receiving location to destination</span>
            <SelectChoice
              label="Receiving location to destination"
              value={stopDraft.transport}
              options={[
                stopDraft.stopKey === "forwarder" ? "Forwarder ships" : "Buyer ships",
                ...(shipments.find((shipment) => shipment.id === stopFor)?.destination.startsWith("Amazon")
                  ? ["Amazon pickup"]
                  : [])
              ]}
              onChange={(transport) => setStopDraft({ ...stopDraft, transport })}
            />
          </div>
          {stopDraft.transport === "Amazon pickup" && (
            <p className="text-xs text-muted-foreground">
              Amazon picks up from {receivingStops[stopDraft.stopKey].location}.
            </p>
          )}
          <DialogFooter className={dialogFooterClass}>
            <Button variant="outline" onClick={() => setStopFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (stopFor) {
                  updateShipment(stopFor, { stop: true, ...stopDraft })
                }
                setStopFor(null)
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={deletingShipment !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingShipment(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Shipment {deletingShipment?.id}?</DialogTitle>
            <DialogDescription>This removes the shipment and its products from this order.</DialogDescription>
          </DialogHeader>
          <DialogFooter className={dialogFooterClass}>
            <Button variant="outline" onClick={() => setDeletingShipment(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (deletingShipment) {
                  deleteShipment(deletingShipment.id)
                }
              }}
            >
              Delete shipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={adjusting} onOpenChange={setAdjusting}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Manage cost summary</DialogTitle>
            <DialogDescription className="sr-only">Purchase order adjustments</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_2.25rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_2.25rem]">
            <span className="text-xs font-medium">Adjustment</span>
            <span className="text-xs font-medium">Amount</span>
            <span className="sr-only">Actions</span>
            {adjustmentDraft.map((row) => (
              <div key={row.id} className="col-span-3 grid grid-cols-subgrid items-center">
                <Combobox<string>
                  items={["Packing", "Handling", "Shipping", "Discount"]}
                  inputValue={row.name}
                  onInputValueChange={(value, details) => {
                    if (details.reason !== "input-change" && details.reason !== "input-clear") {
                      return
                    }
                    setAdjustmentDraft((current) =>
                      current.map((item) => (item.id === row.id ? { ...item, name: value } : item))
                    )
                  }}
                  onValueChange={(value) => {
                    if (value) {
                      setAdjustmentDraft((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, name: value } : item))
                      )
                    }
                  }}
                >
                  <ComboboxInput aria-label="Adjustment" placeholder="e.g. Packing" />
                  <ComboboxContent>
                    <ComboboxList>
                      {(item: string) => (
                        <ComboboxItem key={item} value={item}>
                          {item}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <InputGroup>
                  <InputGroupAddon>$</InputGroupAddon>
                  <InputGroupNumberInput
                    step="0.01"
                    className="text-end"
                    aria-label={`${row.name || "Adjustment"} amount`}
                    value={row.amount / 100}
                    onChange={(event) =>
                      setAdjustmentDraft((current) =>
                        current.map((item) =>
                          item.id === row.id
                            ? { ...item, amount: Math.round((event.target.valueAsNumber || 0) * 100) }
                            : item
                        )
                      )
                    }
                  />
                </InputGroup>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${row.name || "adjustment"}`}
                  onClick={() => setAdjustmentDraft((current) => current.filter((item) => item.id !== row.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button
            className="justify-self-start"
            variant="ghost"
            onClick={() => setAdjustmentDraft([...adjustmentDraft, { id: crypto.randomUUID(), name: "", amount: 0 }])}
          >
            <Plus />
            Add adjustment
          </Button>
          <div className="flex justify-between border-t pt-3 font-semibold">
            <span>Total</span>
            <span>{cash(subtotal + adjustmentDraft.reduce((sum, row) => sum + row.amount, 0))}</span>
          </div>
          <DialogFooter className={dialogFooterClass}>
            <Button variant="outline" onClick={() => setAdjusting(false)}>
              Cancel
            </Button>
            <Button
              disabled={adjustmentDraft.some((row) => !row.name.trim())}
              onClick={() => {
                setAdjustments(adjustmentDraft.map((row) => ({ ...row, name: row.name.trim() })))
                setAdjusting(false)
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// How the cartons travel in this prototype, one line per leg, under the shipment's route.
function ShipmentTransportLegs({ legs }: { legs: string[] }) {
  return (
    <div className="space-y-1.5 text-xs">
      {legs.map((leg, index) => (
        <p key={`${index}-${leg}`} className="flex items-start gap-2">
          <Truck aria-hidden className="mt-px size-3.5 shrink-0 text-muted-foreground" />
          {leg}
        </p>
      ))}
    </div>
  )
}
