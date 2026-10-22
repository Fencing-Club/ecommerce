import { Toast } from "@base-ui/react/toast"
import { zodResolver } from "@hookform/resolvers/zod"
import type { OrderInput } from "@repo/copacker-orders"
import { checkPallets, palletRules, validatePallets } from "@repo/copacker-packing-rules"
import type { Packing, PackingDraft } from "@repo/copacker-shipments"
import { Download, Info, Plus, Upload } from "lucide-react"
import { useId, useState } from "react"
import { FormProvider, useFieldArray, useForm, useFormContext, useFormState, useWatch } from "react-hook-form"
import { useNow, useTimeZone, useTranslations } from "use-intl"
import type { z } from "zod"
import { FormError } from "@/components/form-feedback"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useFormErrorMap } from "@/hooks/use-error-text"
import { useCartonTemplate, usePalletTemplate } from "@/hooks/use-import-templates"
import { usePackingDraft } from "@/hooks/use-packing-draft"
import {
  cartonMeasures,
  cartonTotals,
  checkCartons,
  completeCartons,
  completePallets,
  editorPallets,
  groupCartons,
  maxCartons,
  nextCartonId,
  nextPalletId,
  packedPallets,
  packedPieces,
  packingEditorSchema,
  type PackingValues,
  type PalletValue,
  physicalCartons,
  piecesLeft,
  totalPiecesLeft
} from "@/lib/carton-groups"
import { downloadSpreadsheet } from "@/lib/spreadsheet-import"
import { zonedDay } from "@/lib/time-zone"
import { emptyAddress } from "./address-fields"
import { CartonImportDialog } from "./carton-import-dialog"
import { CartonList } from "./carton-list"
import { FormInput } from "./form-controls"
import { PackedProductsTable } from "./packed-products-table"
import { PackingActionBar } from "./packing-action-bar"
import { FieldError } from "./packing-fields"
import { usePackingIssueText } from "./packing-issues"
import { PalletImportDialog } from "./pallet-import-dialog"
import { PalletList } from "./pallet-list"
import { type PartnerAddress, PartnerAddressDialog } from "./partner-address"
import { PickupAddressSelect } from "./pickup-address-select"
import { LinkExistingShipment } from "./shipment-actions"
import { ShipmentLayout } from "./shipment-layout"
import { savedAddress, ShipmentPackingDetails, startingAddress } from "./shipment-packing-details"

type EditorSchema = ReturnType<typeof packingEditorSchema>
// An empty number field, which is null once someone empties it. It renders blank, fails validation with "Enter a
// number", and is dropped from drafts. The form has no other nulls.
const blank = Number.NaN
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

// A shipment's packing list as the supplier fills it in, in the shipment page's layout: where the cartons leave from and
// when they're ready, the cartons, and the pallets when they're packed on them, with the checks Finish packing runs. A
// packed shipment shows the same layout without the form (ShipmentLayout).
export function PackingForm({
  shipmentId,
  revision,
  orderRevision,
  reserved,
  order,
  packingGroups,
  initial,
  addresses,
  addAddressTo,
  linkedAmazonShipmentId,
  shippingDetails,
  shipmentName,
  renderHeader,
  renderSidebar,
  renderProductActions,
  onSubmitted
}: {
  shipmentId: string
  revision: number
  orderRevision: number
  // The pieces of each line the purchase order's other shipments hold.
  reserved: Readonly<Record<string, number>>
  order: OrderInput
  // Amazon's packing groups by SKU, for a packing with FBA cartons, which keep to one group each; null while Amazon
  // hasn't set them, when the cartons can't be checked against them.
  packingGroups?: Readonly<Record<string, string>> | null
  initial: PackingDraft | null
  // The supplier's saved pickup addresses.
  addresses: PartnerAddress[]
  // The supplier that hasn't joined, when the buyer's owner fills this in for it and can save addresses to it.
  addAddressTo?: { id: string; name: string }
  // Present only for a buyer's AWD draft. Null means it has no existing Amazon shipment yet.
  linkedAmazonShipmentId?: string | null
  shippingDetails?: { route: string[]; shipTo: React.ReactNode; transport?: React.ReactNode }
  shipmentName?: string
  // The page's own header, given the form's actions to show beside the title.
  renderHeader?: (actions: React.ReactNode) => React.ReactNode
  // Beside the form, given what the cartons come to, such as the documents and Shipment details.
  renderSidebar?: (summary: ReturnType<typeof cartonMeasures> & { readyDate: string }) => React.ReactNode
  renderProductActions?: (item: OrderInput["items"][number]) => React.ReactNode
  onSubmitted?: (packing: Packing) => void
}) {
  const t = useTranslations("orders.packing")
  const importText = useTranslations("orders.cartonImport")
  const palletImportText = useTranslations("orders.palletImport")
  const palletText = useTranslations("orders.pallets")
  const packingIssueText = usePackingIssueText()
  const formErrorMap = useFormErrorMap()
  // The zone the supplier's browser reports, so today is the supplier's own; UTC until it has reported one.
  const timeZone = useTimeZone() ?? "UTC"
  const formId = useId()
  const toast = Toast.useToastManager()
  const draft = usePackingDraft({ shipmentId, revision, orderRevision })
  const [importing, setImporting] = useState(false)
  const [importingPallets, setImportingPallets] = useState(false)
  const start = startingAddress(addresses, initial?.origin)
  // The saved address the cartons leave from, or "" for one typed in.
  const [pickup, setPickup] = useState(start?.id ?? "")
  const form = useForm<PackingValues, unknown, z.output<EditorSchema>>({
    mode: "onChange",
    resolver: zodResolver(packingEditorSchema(timeZone), { error: formErrorMap }),
    defaultValues: {
      readyDate: initial?.readyDate ?? "",
      origin: { ...emptyAddress, ...(start?.address ?? initial?.origin) },
      cartons: groupCartons(initial?.cartons),
      palletized: initial?.palletized ?? false,
      pallets: editorPallets(initial?.pallets),
      changes: []
    }
  })
  const cartons = useFieldArray({ control: form.control, name: "cartons" })
  const readyDate = useWatch({ control: form.control, name: "readyDate" })
  const watchedCartons = useWatch({ control: form.control, name: "cartons" }) ?? []
  const cartonValues = cartons.fields.map((carton, index) => watchedCartons[index] ?? carton)
  const palletized = useWatch({ control: form.control, name: "palletized" }) ?? false
  const palletValues = useWatch({ control: form.control, name: "pallets" }) ?? []
  const totals = cartonTotals(cartonValues)
  const physical = physicalCartons(cartonValues)
  const pallets = packedPallets(palletValues, physical)
  const canSave = totals.cartons <= maxCartons
  const packed = packedPieces(physical)
  const allUnitsPacked =
    order.items.some((item) => piecesLeft(item, reserved) > 0) &&
    order.items.every((item) => (packed[item.id] ?? 0) === piecesLeft(item, reserved))
  const packingIssues = [
    ...checkCartons(order, cartonValues, reserved, packingGroups ?? undefined),
    // Pallets are checked against every carton, complete or not.
    ...(palletized
      ? [...validatePallets({ cartons: physical, pallets }), ...checkPallets(order, { cartons: physical, pallets })]
      : [])
  ]
  const otherIssues = packingIssues.filter((issue) => !issue.cartonId && !palletRules.has(issue.code))
  // Finishing takes every carton, and every pallet when packed on them, complete, with nothing for the checks to point
  // out.
  const ready =
    cartonValues.length > 0 &&
    packingIssues.length === 0 &&
    completeCartons(physical).length === physical.length &&
    (!palletized || completePallets(pallets).length === pallets.length)
  const cartonTemplate = useCartonTemplate(order)
  const palletTemplate = usePalletTemplate(physical.map((carton) => carton.cartonId))
  const context = `${order.reference} / ${shipmentName ?? t("cartons")}`
  // The cartons or pallets in their import template, to edit and import again.
  async function exportSheet(title: string, build: () => Promise<BlobPart>, failed: string) {
    try {
      downloadSpreadsheet(await build(), [title, order.reference, shipmentName ?? t("cartons")])
    } catch {
      toast.add({ title: failed })
    }
  }
  async function submit(values: PackingValues) {
    const packing = await draft.submit(values)
    if (packing) {
      onSubmitted?.(packing)
    }
  }
  function setPallets(next: PalletValue[]) {
    form.setValue("pallets", next, { shouldDirty: true, shouldValidate: form.formState.submitCount > 0 })
  }
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
  const actionBar = (placement: "header" | "footer") => (
    <PackingActionBar
      formId={formId}
      placement={placement}
      finishing={allUnitsPacked}
      ready={ready}
      canSave={canSave}
      working={draft.working}
      onSaveDraft={() => void draft.save(form.getValues())}
    />
  )
  return (
    <FormProvider {...form}>
      <ShipmentLayout
        header={
          renderHeader ? (
            renderHeader(actionBar("header"))
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-3">{actionBar("header")}</div>
          )
        }
        busy={draft.working !== null}
        notices={
          linkedAmazonShipmentId !== undefined && (
            <LinkExistingShipment
              key={linkedAmazonShipmentId ?? "unlinked"}
              linkedId={linkedAmazonShipmentId}
              onLink={(amazonShipmentId) => draft.link(form.getValues(), amazonShipmentId)}
            />
          )
        }
        details={
          <PackingDetailsFields
            addresses={addresses}
            addAddressTo={addAddressTo}
            pickup={pickup}
            onPickupChange={setPickup}
            route={shippingDetails?.route}
            shipTo={shippingDetails?.shipTo}
            transport={shippingDetails?.transport}
          />
        }
        products={
          <PackedProductsTable
            order={order}
            cartons={cartonValues}
            reserved={reserved}
            renderActions={renderProductActions}
          />
        }
        sidebar={renderSidebar?.({ ...cartonMeasures(cartonValues, palletized ? pallets : undefined), readyDate })}
      >
        {/* The key handler is delegated from the fields and only keeps Enter from submitting; the form adds no action. */}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <form
          id={formId}
          onSubmit={(event) => {
            if (!allUnitsPacked) {
              event.preventDefault()
              void draft.save(form.getValues())
              return
            }
            // Each invalid field shows its own error, and the first one takes focus, so nothing else is added; an
            // earlier attempt's message no longer applies.
            return form.handleSubmit(() => submit(form.getValues()), draft.clearError)(event)
          }}
          onKeyDown={keepEnterFromSubmitting}
          noValidate
          className="flex flex-col gap-6"
        >
          <CartonList
            order={order}
            cartons={cartonValues}
            reserved={reserved}
            groupsUnchecked={packingGroups === null}
            error={form.formState.errors.cartons?.message ?? form.formState.errors.cartons?.root?.message}
            actions={
              <div className="flex gap-2">
                <IconAction
                  label={importText("export")}
                  disabled={!cartons.fields.length}
                  onClick={() =>
                    void exportSheet("Cartons", () => cartonTemplate(cartonValues), importText("exportFailed"))
                  }
                >
                  <Download />
                </IconAction>
                <IconAction label={importText("title")} onClick={() => setImporting(true)}>
                  <Upload />
                </IconAction>
                <Button type="button" variant="outline" className="max-sm:w-[34px] max-sm:px-0" onClick={addCarton}>
                  <Plus />
                  <span className="max-sm:sr-only">{t("addCarton")}</span>
                </Button>
              </div>
            }
            rowKeys={cartons.fields.map((carton) => carton.id)}
            issues={packingIssues}
            context={context}
            showErrors={(ids) =>
              form.formState.submitCount > 0 ||
              Boolean(initial?.cartons?.some((carton) => carton.cartonId && ids.includes(carton.cartonId)))
            }
            onChange={(index, next) =>
              form.setValue(`cartons.${index}`, next, { shouldDirty: true, shouldValidate: true })
            }
            onDuplicate={(index) =>
              cartons.append({
                ...structuredClone(form.getValues(`cartons.${index}`)),
                cartonId: nextCartonId(cartonValues),
                cartonIds: []
              })
            }
            onDelete={(index) => cartons.remove(index)}
          />
          {palletized && (
            <PalletList
              order={order}
              cartons={cartonValues}
              pallets={pallets}
              issues={packingIssues.filter((issue) => palletRules.has(issue.code))}
              context={context}
              showErrors={form.formState.submitCount > 0}
              onChange={setPallets}
              actions={
                <div className="flex gap-2">
                  <IconAction
                    label={palletImportText("export")}
                    disabled={!pallets.length}
                    onClick={() =>
                      void exportSheet("Pallets", () => palletTemplate(pallets), palletImportText("exportFailed"))
                    }
                  >
                    <Download />
                  </IconAction>
                  <IconAction label={palletImportText("title")} onClick={() => setImportingPallets(true)}>
                    <Upload />
                  </IconAction>
                  <Button
                    type="button"
                    variant="outline"
                    className="max-sm:w-[34px] max-sm:px-0"
                    onClick={() =>
                      setPallets([
                        ...pallets,
                        {
                          palletId: nextPalletId(pallets),
                          length: blank,
                          width: blank,
                          height: blank,
                          weight: blank,
                          stackable: true,
                          cartonIds: []
                        }
                      ])
                    }
                  >
                    <Plus />
                    <span className="max-sm:sr-only">{palletText("addPallet")}</span>
                  </Button>
                </div>
              }
            />
          )}
        </form>
        <div className="flex flex-col gap-3 text-sm">
          {otherIssues.length > 0 && (
            <ul aria-live="polite" className="flex flex-col gap-1">
              {otherIssues.map((issue, index) => (
                <li key={index}>
                  <FieldError>{packingIssueText(issue)}</FieldError>
                </li>
              ))}
            </ul>
          )}
          {draft.error && (
            <div className="max-h-48 overflow-y-auto">
              <FormError message={draft.error} />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {/* The sidebar has the totals, so a phone, where it sits below, gets only the counts above the button. */}
            {renderSidebar && (
              <p className="mb-3 flex w-full items-baseline justify-between gap-3 text-meta tabular-nums sm:hidden">
                <span className="font-medium">{importText("cartonCount", { count: totals.cartons })}</span>
                <span className="text-muted-foreground">
                  {t("packedUnits", { count: totals.pieces, available: totalPiecesLeft(order.items, reserved) })}
                </span>
              </p>
            )}
            {actionBar("footer")}
          </div>
        </div>
        <CartonImportDialog
          open={importing}
          onOpenChange={setImporting}
          order={order}
          shipmentName={shipmentName ?? t("cartons")}
          existing={cartonValues}
          reserved={reserved}
          packingGroups={packingGroups ?? undefined}
          onImport={async (groups, mode) => {
            cartons.replace(mode === "replace" ? groups : [...form.getValues("cartons"), ...groups])
          }}
        />
        <PalletImportDialog
          open={importingPallets}
          onOpenChange={setImportingPallets}
          reference={order.reference}
          shipmentName={shipmentName ?? t("cartons")}
          cartonIds={physical.map((carton) => carton.cartonId)}
          existing={pallets}
          onImport={async (next, mode) => {
            setPallets(mode === "replace" ? next : [...pallets, ...next])
          }}
        />
      </ShipmentLayout>
    </FormProvider>
  )
}

// An icon button of the Cartons or Pallets section, named by its tooltip.
function IconAction({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// Where the cartons leave from, chosen from the supplier's saved addresses or added, and the packing's own fields: the
// ready date and whether the cartons ship on pallets. They sit in the card with the shipment's route and destination.
export function PackingDetailsFields({
  addresses,
  addAddressTo,
  pickup,
  onPickupChange,
  route,
  shipTo,
  transport
}: {
  addresses: PartnerAddress[]
  addAddressTo?: { id: string; name: string }
  pickup: string
  onPickupChange: (id: string) => void
  route?: string[]
  shipTo?: React.ReactNode
  transport?: React.ReactNode
}) {
  const t = useTranslations("orders.packing")
  const palletText = useTranslations("orders.pallets")
  const form = useFormContext<PackingValues>()
  // The date picker offers nothing before today where the supplier is, the same day finishing packing checks against.
  // The clock ticks each minute, so a page left open past midnight moves on to the next day here too.
  const today = zonedDay(useNow({ updateInterval: 60000 }), useTimeZone() ?? "UTC")
  const origin = useWatch({ control: form.control, name: "origin" }) ?? emptyAddress
  const palletized = useWatch({ control: form.control, name: "palletized" }) ?? false
  const palletizedId = useId()
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
                const next = { ...address, id: address.id }
                setAdded((list) => [...list, next])
                choose(next)
              }
            }}
          />
        </>
      }
      packing={
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div className="w-full max-w-72">
            <FormInput name="readyDate" required label={t("readyDate")} type="date" min={today} />
          </div>
          <div className="flex min-h-9 items-center gap-2.5">
            <Checkbox
              id={palletizedId}
              checked={palletized}
              onCheckedChange={(checked) =>
                form.setValue("palletized", checked, { shouldDirty: true, shouldValidate: true })
              }
            />
            <Label htmlFor={palletizedId} className="font-normal">
              {palletText("packedOnPallets")}
            </Label>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={palletText("packedOnPalletsHelp")}
                  />
                }
              >
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{palletText("packedOnPalletsHint")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      }
    />
  )
}
