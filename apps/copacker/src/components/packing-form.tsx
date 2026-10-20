import { Toast } from "@base-ui/react/toast"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  type Address,
  type OrderInput,
  type PackingDraft,
  type Packing,
  packingSchema,
  cartonInputSchema,
  validatePacking,
  money
} from "@repo/aisle"
import { useRouter } from "@tanstack/react-router"
import { CircleCheck, Ellipsis, Plus, Upload } from "lucide-react"
import { useId, useState } from "react"
import { FormProvider, useFieldArray, useForm, useFormContext, useFormState, useWatch } from "react-hook-form"
import { objectKeys } from "ts-extras"
import { useLocale, useTranslations } from "use-intl"
import { z } from "zod"
import { useCan } from "@/components/access"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useErrorMessage, useFormErrorMap } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"
import { cartonTotals, expandCartonGroups, groupCartons, nextCartonId, packingEditorSchema } from "@/lib/carton-groups"
import { cn } from "@/lib/utils"
import { emptyAddress } from "./address-fields"
import { CartonEditor } from "./carton-editor"
import { CartonImportDialog } from "./carton-import-dialog"
import { EmptyState } from "./common"
import { FormInput } from "./form-controls"
import { type PartnerAddress, PartnerAddressDialog } from "./partner-address"
import { PickupAddressSelect } from "./pickup-address-select"
import { ProductIdentity } from "./product-identity"
import { LinkExistingShipment } from "./shipment-actions"
import { ShipmentAddress, ShipmentPackingDetails } from "./shipment-packing-details"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
type Values = z.input<typeof packingEditorSchema>
// An empty number field, which is null once someone empties it. It renders blank, fails validation with "Enter a
// number", and is dropped from drafts. The form has no other nulls.
const blank = Number.NaN
const withoutBlanks = (values: z.input<typeof packingSchema>): PackingDraft =>
  JSON.parse(
    JSON.stringify(values, (_, value) =>
      value === null || (typeof value === "number" && Number.isNaN(value)) ? undefined : value
    )
  )
const checkResult = z.object({
  canSubmit: z.boolean(),
  requiresApproval: z.boolean(),
  issues: z.array(z.object({ message: z.string(), field: z.string().optional(), cartonId: z.string().optional() }))
})
// The product table's first and last columns line up with the card's header.
const edgeCells = "[&_td:first-child]:ps-4 [&_td:last-child]:pe-4 [&_th:first-child]:ps-4 [&_th:last-child]:pe-4"
// Which saved address a pickup address is, while it's unchanged.
const savedAddress = (addresses: PartnerAddress[], origin: Partial<Address>) =>
  addresses.find(({ address }) => objectKeys(emptyAddress).every((key) => (address[key] ?? "") === (origin[key] ?? "")))
// Enter in a field must not finish packing, so only the Finish packing button
// submits. Buttons still press and text areas still start a new line, and a dialog opened from here keeps its own
// Enter: its fields belong to its own form.
function keepEnterFromSubmitting(event: React.KeyboardEvent<HTMLFormElement>) {
  if (
    event.key === "Enter" &&
    !event.nativeEvent.isComposing &&
    event.target instanceof HTMLInputElement &&
    event.target.form === event.currentTarget
  ) {
    event.preventDefault()
  }
}
export function PackingForm({
  shipmentId,
  revision,
  orderRevision,
  availablePieces,
  order,
  initial,
  addresses,
  addAddressTo,
  linkedAmazonShipmentId,
  destination,
  shippingDetails,
  shipmentName,
  heading,
  renderHeader,
  renderSidebar,
  renderProductActions,
  readOnly = false,
  onSubmitted
}: {
  renderSidebar?: (summary: {
    cartons: number
    units: number
    readyDate: string
    weight: number | null
    volume: number | null
  }) => React.ReactNode
  renderProductActions?: (item: OrderInput["items"][number]) => React.ReactNode
  heading?: React.ReactNode
  // The page's own header, given the form's actions to show beside the title.
  renderHeader?: (actions: React.ReactNode) => React.ReactNode
  readOnly?: boolean
  onSubmitted?: (packing: Packing) => void
  shipmentName?: string
  destination?: React.ReactNode
  shippingDetails?: { route: string[]; shipTo: React.ReactNode; transport?: React.ReactNode }
  shipmentId: string
  revision: number
  orderRevision: number
  availablePieces: Record<string, number>
  order: OrderInput
  initial: PackingDraft | null
  // The supplier's saved pickup addresses.
  addresses: PartnerAddress[]
  // The supplier that hasn't joined, when the buyer's owner fills this in for it and can save addresses to it.
  addAddressTo?: { id: string; name: string }
  // Present only for a buyer's AWD draft. Null means it has no existing Amazon shipment yet.
  linkedAmazonShipmentId?: string | null
}) {
  const actionsText = useTranslations("orders.detail.columns")
  const t = useTranslations("orders.packing")
  const locale = useLocale()
  const detail = useTranslations("orders.detail")
  const rules = useTranslations("server.readiness.packing")
  const errorMessage = useErrorMessage()
  const formErrorMap = useFormErrorMap()
  const router = useRouter()
  const [run] = useActionMutation()
  const formId = useId()
  // Purchase-order values are read-only during packing.
  const prices = useCan("prices")
  const [savedRevision, setSavedRevision] = useState(revision)
  const toast = Toast.useToastManager()
  const [serverError, setServerError] = useState("")
  const [working, setWorking] = useState<"save" | "submit" | "link" | null>(null)
  const [linkedId, setLinkedId] = useState(linkedAmazonShipmentId)
  const [importing, setImporting] = useState(false)
  const importText = useTranslations("orders.cartonImport")
  // A packing list without a pickup address yet starts from the supplier's only saved one.
  const noOrigin = objectKeys(emptyAddress).every((key) => !initial?.origin?.[key])
  const startAddress =
    noOrigin && addresses.length === 1 ? addresses[0] : savedAddress(addresses, initial?.origin ?? {})
  // The saved address the cartons leave from, or "" for one typed in.
  const [pickup, setPickup] = useState(startAddress?.id ?? "")
  const form = useForm<Values, unknown, z.output<typeof packingEditorSchema>>({
    mode: "onChange",
    resolver: zodResolver(packingEditorSchema, { error: formErrorMap }),
    defaultValues: {
      readyDate: initial?.readyDate ?? "",
      origin: { ...emptyAddress, ...(startAddress?.address ?? initial?.origin) },
      cartons: groupCartons(initial?.cartons),
      changes: []
    }
  })
  const cartons = useFieldArray({ control: form.control, name: "cartons" })
  const readyDate = useWatch({ control: form.control, name: "readyDate" })
  const cartonValues = useWatch({ control: form.control, name: "cartons" }) ?? []
  const totals = cartonTotals(cartonValues)
  const physicalCartons = totals.cartons > 1000 ? [] : expandCartonGroups(cartonValues)
  const contents = physicalCartons.flatMap((carton) => carton.items)
  const pieces = contents.reduce((total, item) => total + (item.pieces || 0), 0)
  const packed = (itemId: string) =>
    contents.reduce((total, item) => total + (item.itemId === itemId ? item.pieces || 0 : 0), 0)
  const allUnitsPacked =
    order.items.some((item) => (availablePieces[item.id] ?? 0) > 0) &&
    order.items.every((item) => packed(item.id) === (availablePieces[item.id] ?? 0))
  const cartonsError = form.formState.errors.cartons?.message ?? form.formState.errors.cartons?.root?.message
  const completeCartons = physicalCartons.flatMap((carton) => {
    const result = cartonInputSchema.safeParse(carton)
    return result.success ? [result.data] : []
  })
  const packingIssues = validatePacking(
    order,
    { cartons: completeCartons, changes: [] },
    Object.fromEntries(order.items.map((item) => [item.id, Math.max(0, item.pieces - (availablePieces[item.id] ?? 0))]))
  ).issues
  const issueText = (issue: (typeof packingIssues)[number]) =>
    "values" in issue ? rules(issue.code, issue.values) : rules(issue.code)
  // Drafts save incomplete values; submission runs authoritative checks after field validation.
  async function saveDraft(draft: Values) {
    if (cartonTotals(draft.cartons).cartons > 1000) {
      throw new Error(importText("errors.limit"))
    }
    const saved = z.object({ revision: z.number() }).parse(
      await run({
        action: "shipment.save",
        data: {
          id: shipmentId,
          revision: savedRevision,
          orderRevision,
          draft: withoutBlanks({ ...draft, cartons: expandCartonGroups(draft.cartons) })
        }
      }).unwrap()
    )
    setSavedRevision(saved.revision)
    return saved.revision
  }
  async function perform(mode: "save" | "submit", values: Values) {
    setWorking(mode)
    setServerError("")
    try {
      const nextRevision = await saveDraft(values)
      if (mode === "save" || !allUnitsPacked) {
        toast.add({ title: t("draftSaved") })
        return
      }
      const checked = checkResult.parse(await run({ action: "shipment.check", data: { id: shipmentId } }).unwrap())
      if (!checked.canSubmit) {
        setServerError(
          checked.issues
            .map((issue) =>
              issue.cartonId ? t("cartonIssue", { carton: issue.cartonId, message: issue.message }) : issue.message
            )
            .join("\n")
        )
        return
      }
      await run({ action: "shipment.submit", data: { id: shipmentId, revision: nextRevision } }).unwrap()
      onSubmitted?.(packingSchema.parse(withoutBlanks({ ...values, cartons: expandCartonGroups(values.cartons) })))
      router.invalidate()
    } catch (error) {
      setServerError(errorMessage(error, t("saveFailed")))
    } finally {
      setWorking(null)
    }
  }
  async function linkShipment(amazonShipmentId: string | null) {
    setWorking("link")
    setServerError("")
    try {
      // Preserve any incomplete packing before changing the link; both writes use the latest revision.
      const nextRevision = await saveDraft(form.getValues())
      const result = z.object({ revision: z.number() }).parse(
        await run({
          action: "shipment.linkExisting",
          data: { id: shipmentId, revision: nextRevision, amazonShipmentId }
        }).unwrap()
      )
      setSavedRevision(result.revision)
      setLinkedId(amazonShipmentId)
      router.invalidate()
    } finally {
      setWorking(null)
    }
  }
  const validated = () =>
    form.handleSubmit(
      () => perform("submit", form.getValues()),
      () => {
        setServerError(t("fixFields"))
      }
    )
  function addCarton() {
    cartons.append({
      cartonId: nextCartonId(cartonValues),
      count: 1,
      cartonIds: [],
      length: blank,
      width: blank,
      height: blank,
      weight: blank,
      items: []
    })
  }
  // A header beside the title takes the actions, which the bar below the cartons keeps only on a phone.
  const headed = Boolean(heading || renderHeader)
  const actions = !readOnly && (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="outline" size="icon" aria-label={actionsText("actions")} />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={totals.cartons > 1000} onClick={() => void perform("save", form.getValues())}>
            {t("saveDraft")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SubmitButton
        className="max-sm:hidden"
        type="submit"
        form={formId}
        pending={working === (allUnitsPacked ? "submit" : "save")}
        disabled={
          totals.cartons > 1000 ||
          (allUnitsPacked &&
            (!cartons.fields.length || packingIssues.length > 0 || completeCartons.length !== physicalCartons.length))
        }
      >
        {t(allUnitsPacked ? "finishPacking" : "saveDraft")}
      </SubmitButton>
    </div>
  )
  return (
    <FormProvider {...form}>
      {/* Also the sticky action bar's container, so the bar stays in view down to the last card. */}
      <fieldset disabled={working !== null} className="@container/po flex min-w-0 flex-col gap-6 text-sm">
        {renderHeader?.(actions)}
        {heading && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {heading}
            {actions}
          </div>
        )}
        <div
          className={cn("grid min-w-0 items-start gap-6", renderSidebar && "@5xl/po:grid-cols-[minmax(0,1fr)_17rem]")}
        >
          <div className="flex min-w-0 flex-col gap-6">
            {linkedId !== undefined && (
              <LinkExistingShipment key={linkedId ?? "unlinked"} linkedId={linkedId} onLink={linkShipment} />
            )}
            <PackingDetailsFields
              addresses={addresses}
              addAddressTo={addAddressTo}
              pickup={pickup}
              onPickupChange={setPickup}
              readOnly={readOnly}
              route={shippingDetails?.route}
              shipTo={shippingDetails?.shipTo ?? destination}
              transport={shippingDetails?.transport}
            />
            {/* The key handler is delegated from the fields and only keeps Enter from submitting; the form adds no action. */}
            {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <form
              id={formId}
              onSubmit={(event) => {
                if (allUnitsPacked) {
                  return validated()(event)
                }
                event.preventDefault()
                void perform("save", form.getValues())
              }}
              onKeyDown={keepEnterFromSubmitting}
              noValidate
              className="flex flex-col gap-6"
            >
              <Accordion className="rounded-lg border bg-card">
                <AccordionItem value="products">
                  <AccordionTrigger className="items-center gap-3 px-4 py-3.5 text-sm font-medium hover:no-underline">
                    {detail("columns.products")} ({order.items.length})
                  </AccordionTrigger>
                  <AccordionContent className="pb-0 [&_p:not(:last-child)]:mb-0">
                    {/* The PO's lines as the carton cards show products: name and variation, supplier SKU, then how many
                        are packed. Below 32rem each line stacks, with its column names above the values. */}
                    <div className="@container/products border-t">
                      <Table framed={false} className={cn("table-fixed @max-lg/products:block", edgeCells)}>
                        <TableHeader className="bg-muted/60 @max-lg/products:hidden [&_th]:h-8 [&_th]:text-xs [&_th]:font-normal [&_th]:text-muted-foreground">
                          <TableRow className="hover:bg-transparent">
                            <TableHead>{t("product")}</TableHead>
                            <TableHead className="w-36">{t("supplierSku")}</TableHead>
                            <TableHead className="w-28 text-end">{t("packed")}</TableHead>
                            {prices && <TableHead className="w-28 text-end">{t("pricePerUnit")}</TableHead>}
                            {renderProductActions && (
                              <TableHead className="w-14">
                                <span className="sr-only">{actionsText("actions")}</span>
                              </TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody className="@max-lg/products:block">
                          {order.items.map((item) => {
                            const available = availablePieces[item.id] ?? 0
                            const count = packed(item.id)
                            return (
                              <TableRow
                                key={item.id}
                                className="hover:bg-transparent @max-lg/products:relative @max-lg/products:grid @max-lg/products:grid-cols-3 @max-lg/products:gap-x-4 @max-lg/products:gap-y-2 @max-lg/products:p-4 [&>td]:py-3 [&>td]:align-top @max-lg/products:[&>td]:p-0"
                              >
                                <TableCell className="whitespace-normal [overflow-wrap:anywhere] @max-lg/products:col-span-3 @max-lg/products:ps-0! @max-lg/products:pe-10!">
                                  <ProductIdentity item={item} showSku={false} showPackSize={false} />
                                </TableCell>
                                <TableCell className="whitespace-normal [overflow-wrap:anywhere]">
                                  <span className="mb-1 block text-xs text-muted-foreground @lg/products:hidden">
                                    {t("supplierSku")}
                                  </span>
                                  {item.components?.length ? (
                                    <span className="flex flex-col gap-1">
                                      {item.components.map((component) => (
                                        <span key={component.variantId}>
                                          {component.quantity} × {component.supplierSku || component.buyerSku || "—"}
                                        </span>
                                      ))}
                                    </span>
                                  ) : (
                                    item.supplierSku || "—"
                                  )}
                                </TableCell>
                                <TableCell className="text-end tabular-nums @max-lg/products:text-start">
                                  <span className="mb-1 block text-xs text-muted-foreground @lg/products:hidden">
                                    {t("packed")}
                                  </span>
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1",
                                      available > 0 && count === available && "text-green-700",
                                      count > available && "text-destructive"
                                    )}
                                  >
                                    {available > 0 && count === available && (
                                      <CircleCheck aria-hidden className="size-3.5" />
                                    )}
                                    {t("packedOf", { count, available })}
                                  </span>
                                  {count < available && (
                                    <span className="block text-xs text-muted-foreground">
                                      {t("leftCount", { count: available - count })}
                                    </span>
                                  )}
                                  {count > available && (
                                    <span className="block text-xs text-destructive">
                                      {t("overCount", { count: count - available })}
                                    </span>
                                  )}
                                </TableCell>
                                {prices && (
                                  <TableCell className="text-end tabular-nums @max-lg/products:text-start">
                                    <span className="mb-1 block text-xs text-muted-foreground @lg/products:hidden">
                                      {t("pricePerUnit")}
                                    </span>
                                    {money(item.unitPrice, order.currency, locale)}
                                  </TableCell>
                                )}
                                {renderProductActions && (
                                  <TableCell className="py-2! text-end @max-lg/products:absolute @max-lg/products:end-3 @max-lg/products:top-3">
                                    {renderProductActions(item)}
                                  </TableCell>
                                )}
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <section className="flex flex-col gap-5" aria-label={t("cartons")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-sm font-semibold">{t("cartons")}</h2>
                    <span
                      className={cn(
                        "text-xs tabular-nums text-muted-foreground",
                        pieces === Object.values(availablePieces).reduce((total, value) => total + value, 0) &&
                          "text-green-700"
                      )}
                    >
                      {t("packedUnits", {
                        count: pieces,
                        available: Object.values(availablePieces).reduce((total, value) => total + value, 0)
                      })}
                    </span>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-2">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={importText("title")}
                              onClick={() => setImporting(true)}
                            />
                          }
                        >
                          <Upload />
                        </TooltipTrigger>
                        <TooltipContent>{importText("title")}</TooltipContent>
                      </Tooltip>
                      <Button type="button" variant="outline" onClick={addCarton}>
                        <Plus />
                        {t("addCarton")}
                      </Button>
                    </div>
                  )}
                </div>
                {cartons.fields.map((carton, index) => {
                  const value = cartonValues[index] ?? carton
                  const ids = expandCartonGroups([value]).map((physical) => physical.cartonId)
                  const issues = packingIssues
                    .filter((issue) => issue.cartonId && ids.includes(issue.cartonId))
                    .map((issue) => {
                      const sku = "values" in issue && "sku" in issue.values ? issue.values.sku : undefined
                      let field: string | undefined
                      if (issue.code === "cartonWeight") {
                        field = "weight"
                      } else if (["awdOneSku", "mixedNetworks", "repeatedProduct"].includes(issue.code)) {
                        field = "items"
                      } else if (sku && ["incompletePacks", "awdUnits", "overQuantity"].includes(issue.code)) {
                        field = `items.${value.items.findIndex((content) => order.items.find((item) => item.id === content.itemId)?.buyerSku === sku)}`
                      }
                      return { message: issueText(issue), field, fields: issue.fields }
                    })
                    .filter((issue, i, all) => all.findIndex((other) => other.message === issue.message) === i)
                  return (
                    <CartonEditor
                      key={carton.id}
                      value={value}
                      products={order.items}
                      context={`${order.reference} / ${shipmentName ?? t("cartons")}`}
                      remainingPieces={Object.fromEntries(
                        order.items.map((item) => [item.id, (availablePieces[item.id] ?? 0) - packed(item.id)])
                      )}
                      showErrors={
                        form.formState.submitCount > 0 ||
                        Boolean(initial?.cartons?.some((carton) => carton.cartonId && ids.includes(carton.cartonId)))
                      }
                      issues={issues}
                      readOnly={readOnly}
                      onChange={(next) =>
                        form.setValue(`cartons.${index}`, next, { shouldDirty: true, shouldValidate: true })
                      }
                      onDuplicate={() =>
                        cartons.append({
                          ...structuredClone(value),
                          cartonId: nextCartonId(cartonValues),
                          cartonIds: []
                        })
                      }
                      onDelete={() => cartons.remove(index)}
                    />
                  )
                })}
                {!cartons.fields.length && (
                  <EmptyState title={t("noCartons")} description={t("noCartonsDescription")} />
                )}
                {cartonsError && <FormError message={cartonsError} />}
                {totals.cartons > 1000 && <FormError message={importText("errors.limit")} />}
              </section>
            </form>
            <div
              className={cn(
                "flex flex-col gap-3 text-sm",
                !headed && "sticky bottom-4 z-10 rounded-xl bg-card p-3 shadow-lg ring-1 ring-foreground/10"
              )}
            >
              {packingIssues.some((issue) => !issue.cartonId) && (
                <ul aria-live="polite" className="text-sm text-destructive">
                  {packingIssues
                    .filter((issue) => !issue.cartonId)
                    .map((issue, index) => (
                      <li key={index}>
                        {issue.cartonId
                          ? t("cartonIssue", { carton: issue.cartonId, message: issueText(issue) })
                          : issueText(issue)}
                      </li>
                    ))}
                </ul>
              )}
              {serverError && (
                <div className="max-h-48 overflow-y-auto">
                  <FormError message={serverError} />
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className={cn("flex flex-col px-1", renderSidebar && "hidden")}>
                  <p className="font-medium tabular-nums">
                    {headed
                      ? importText("cartonCount", { count: totals.cartons })
                      : t("cartonsAndUnits", { cartons: totals.cartons, units: pieces })}
                  </p>
                  {headed && completeCartons.length === physicalCartons.length && physicalCartons.length > 0 && (
                    <p className="mt-1 flex gap-5 text-xs tabular-nums">
                      <span>
                        {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                          physicalCartons.reduce((sum, carton) => sum + carton.weight, 0)
                        )}{" "}
                        kg
                      </span>
                      <span>
                        {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                          physicalCartons.reduce(
                            (sum, carton) => sum + (carton.length * carton.width * carton.height) / 1000000,
                            0
                          )
                        )}{" "}
                        m³
                      </span>
                    </p>
                  )}
                </div>
                {!readOnly && (
                  <div className={cn("flex flex-wrap gap-2", headed && "max-sm:w-full sm:hidden")}>
                    <SubmitButton
                      type="button"
                      variant="ghost"
                      className={headed || !allUnitsPacked ? "hidden" : undefined}
                      pending={working === "save"}
                      disabled={totals.cartons > 1000}
                      onClick={() => void perform("save", form.getValues())}
                    >
                      {t("saveDraft")}
                    </SubmitButton>
                    <SubmitButton
                      type="submit"
                      form={formId}
                      pending={working === (allUnitsPacked ? "submit" : "save")}
                      className={headed ? "max-sm:flex-1" : undefined}
                      disabled={
                        totals.cartons > 1000 ||
                        (allUnitsPacked &&
                          (!cartons.fields.length ||
                            packingIssues.length > 0 ||
                            completeCartons.length !== physicalCartons.length))
                      }
                    >
                      {t(allUnitsPacked ? "finishPacking" : "saveDraft")}
                    </SubmitButton>
                  </div>
                )}
              </div>
            </div>
          </div>
          {renderSidebar && (
            <aside className="min-w-0">
              {renderSidebar({
                cartons: totals.cartons,
                units: pieces,
                readyDate,
                weight:
                  completeCartons.length === physicalCartons.length && physicalCartons.length > 0
                    ? physicalCartons.reduce((sum, carton) => sum + carton.weight, 0)
                    : null,
                volume:
                  completeCartons.length === physicalCartons.length && physicalCartons.length > 0
                    ? physicalCartons.reduce(
                        (sum, carton) => sum + (carton.length * carton.width * carton.height) / 1000000,
                        0
                      )
                    : null
              })}
            </aside>
          )}
        </div>
        <CartonImportDialog
          open={importing}
          onOpenChange={setImporting}
          order={order}
          shipmentName={shipmentName ?? t("cartons")}
          existing={cartonValues}
          availablePieces={availablePieces}
          onImport={async (groups, mode) => {
            cartons.replace(mode === "replace" ? groups : [...form.getValues("cartons"), ...groups])
          }}
        />
      </fieldset>
    </FormProvider>
  )
}
export function PackingDetailsFields({
  addresses,
  addAddressTo,
  pickup,
  onPickupChange,
  readOnly = false,
  route,
  shipTo,
  transport
}: {
  addresses: PartnerAddress[]
  addAddressTo?: { id: string; name: string }
  pickup: string
  onPickupChange: (id: string) => void
  readOnly?: boolean
  route?: string[]
  shipTo?: React.ReactNode
  transport?: React.ReactNode
}) {
  const t = useTranslations("orders.packing")
  const form = useFormContext<Values>()
  const origin = useWatch({ control: form.control, name: "origin" }) ?? emptyAddress
  const [adding, setAdding] = useState(false)
  const [editingOrigin, setEditingOrigin] = useState(false)
  const { errors } = useFormState({ control: form.control })
  const addressText = useTranslations("partners.address")
  // Addresses added here, until the refreshed page lists them.
  const [added, setAdded] = useState<PartnerAddress[]>([])
  const current: PartnerAddress | undefined = origin.addressLine1
    ? { id: "shipment-origin", name: origin.name || t("shipFrom"), address: { ...emptyAddress, ...origin } }
    : undefined
  const saved = [...addresses, ...added.filter((address) => !addresses.some((known) => known.id === address.id))]
  const chosen = saved.find((address) => address.id === pickup) ?? (current && savedAddress(saved, current.address))
  const options = chosen || !current ? saved : [current, ...saved]
  const choose = (next: PartnerAddress) => {
    form.clearErrors("origin")
    form.setValue("origin", next.address, { shouldDirty: true, shouldValidate: true })
    onPickupChange(next.id)
  }
  return (
    <ShipmentPackingDetails
      route={route}
      shipTo={shipTo}
      transport={transport}
      shipFrom={
        <>
          {readOnly ? (
            <ShipmentAddress
              readOnly
              label={t("shipFrom")}
              name={chosen?.name ?? origin.name ?? ""}
              address={[
                origin.addressLine1,
                origin.addressLine2,
                origin.city,
                origin.stateOrRegion,
                origin.postalCode,
                origin.countryCode
              ]
                .filter(Boolean)
                .join(", ")}
              contact={[origin.name, origin.phoneNumber].filter(Boolean).join(", ")}
            />
          ) : (
            <>
              <PickupAddressSelect
                addresses={options}
                value={chosen?.id ?? current?.id ?? ""}
                onChange={(id) => {
                  const next = options.find((address) => address.id === id)
                  if (next) {
                    choose(next)
                  }
                }}
                onAdd={() => {
                  setEditingOrigin(false)
                  setAdding(true)
                }}
              />
              {errors.origin && (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">{t("fixFields")}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingOrigin(true)
                      setAdding(true)
                    }}
                  >
                    {addressText("edit")}
                  </Button>
                </div>
              )}
              <PartnerAddressDialog
                draft={editingOrigin ? origin : undefined}
                partner={addAddressTo ? { kind: "supplier", ...addAddressTo } : undefined}
                open={adding}
                onOpenChange={setAdding}
                onSaved={(address) => {
                  if (address.id) {
                    const saved = { ...address, id: address.id }
                    setAdded((list) => [...list, saved])
                    choose(saved)
                  }
                }}
              />
            </>
          )}
        </>
      }
      packing={
        !readOnly && (
          <div className="max-w-72">
            <FormInput name="readyDate" required label={t("readyDate")} type="date" />
          </div>
        )
      }
    />
  )
}
