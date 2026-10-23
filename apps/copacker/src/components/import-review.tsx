import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  FieldGroup,
  Input
} from "@buildkitgg/shadcn-baseui-kit"
import { variantName } from "@repo/copacker-marketplaces/shopify"
import type { CatalogVariant } from "@repo/copacker-marketplaces/shopify"
import { useRouter } from "@tanstack/react-router"
import { FileText, Plus } from "lucide-react"
import { useRef, useState } from "react"
import { flushSync } from "react-dom"
import { arrayIncludes, objectKeys } from "ts-extras"
import { useTranslations } from "use-intl"
import { FieldError } from "@/components/field-error"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { useErrorMessage } from "@/hooks/use-error-text"
import { api } from "@/lib/api"
import type { ImportProposal } from "@/lib/import-proposal"
import { importTotals } from "@/lib/import-totals"
import { useCan } from "./access"
import { keepEnterFromSubmitting } from "./action-form"
import { fileName, PageHeader } from "./common"
import { DateInput, FormLabel } from "./form-controls"
import { SelectField } from "./form-fields"
import { ImportLines, blank, reviewProduct, type ReviewLine, type ReviewProduct, Warnings } from "./import-review-lines"
import { ImportCostSummary, type ReviewCharge } from "./import-review-summary"
import { InviteSupplier } from "./invite-supplier"

const reviewApi = api.injectEndpoints({
  endpoints: (build) => ({
    importState: build.query<{ status: string; orderId: string | null }, string>({
      query: (id) => `imports/${id}`,
      keepUnusedDataFor: 0
    }),
    correctImport: build.mutation<{ revision: number }, { id: string; revision: number; proposal: ImportProposal }>({
      query: ({ id, ...body }) => ({ url: `imports/${id}`, method: "PATCH", body })
    }),
    saveImport: build.mutation<
      { id: string; redirect: string },
      { id: string; revision: number; supplierId: string; reference: string; dueDate?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `imports/${id}/save`,
        method: "POST",
        body: { ...body, reviewed: true, destination: "amazon" }
      })
    })
  })
})

type Line = ImportProposal["items"][number]

// The proposal as the review edits it: each line and charge with its key.
type ReviewProposal = Omit<ImportProposal, "items" | "adjustments"> & {
  items: ReviewLine[]
  adjustments: ReviewCharge[]
}

// The keys the document's own lines and charges start with; a line or charge added during review takes a new one.
function keyed(proposal: ImportProposal): ReviewProposal {
  return {
    ...proposal,
    items: proposal.items.map((item, index) => ({ ...item, key: `line-${index}` })),
    adjustments: proposal.adjustments.map((charge, index) => ({ ...charge, key: `charge-${index}` }))
  }
}

// The proposal as the server takes it, without the review's keys.
function unkeyed({ items, adjustments, ...proposal }: ReviewProposal): ImportProposal {
  return {
    ...proposal,
    items: items.map(({ key: _, ...item }) => item),
    adjustments: adjustments.map(({ key: _, ...charge }) => charge)
  }
}

// The currencies an import can be in, named as the purchase order editor names them, under orders.currencies.
const currencies = objectKeys({
  USD: true,
  CNY: true,
  EUR: true,
  GBP: true,
  CAD: true,
  AUD: true
} satisfies Record<NonNullable<ImportProposal["currency"]>, true>)

// What the review writes as a line's reason, stored in English and shown in the reader's language.
const selectedReason = "Selected during review"
const addedReason = "Added during review"

type ReviewTranslator = ReturnType<typeof useTranslations<"orders.review">>

// A line's reason: the review's own in the reader's language, or the importer's as it wrote it.
function reasonText(reason: string, t: ReviewTranslator) {
  if (reason === selectedReason) {
    return t("selectedDuringReview")
  }
  return reason === addedReason ? t("addedDuringReview") : reason
}

// The line as the document lists it, such as "SKU AB-1, 10 pairs at 1.20, page 2", leaving out what it doesn't say.
function sourceLine(line: Line, t: ReviewTranslator) {
  const parts: string[] = line.sourceSku ? [t("source.sku", { sku: line.sourceSku })] : []
  const unit = line.sourceUnit ?? t("source.units")
  if (line.sourceQuantity !== null) {
    parts.push(
      line.sourceUnitPrice === null
        ? t("source.quantity", { quantity: line.sourceQuantity, unit })
        : t("source.quantityAt", { quantity: line.sourceQuantity, unit, price: line.sourceUnitPrice })
    )
  } else if (line.sourceUnitPrice !== null) {
    parts.push(t("source.each", { price: line.sourceUnitPrice }))
  }
  if (line.sourcePage !== null) {
    parts.push(t("source.page", { page: line.sourcePage }))
  }
  return parts.join(", ")
}

export function ImportReview({
  id,
  filename,
  initialRevision,
  initialProposal,
  initialSelectedProducts,
  suppliers
}: {
  id: string
  filename: string
  initialRevision: number
  initialProposal: ImportProposal
  initialSelectedProducts: Record<string, ReviewProduct>
  suppliers: Array<{ id: string; name: string }>
}) {
  const t = useTranslations("orders")
  const tr = useTranslations("orders.review")
  const validation = useTranslations("validation")
  const errorMessage = useErrorMessage()
  const router = useRouter()
  const canAddSupplier = useCan("partners", "edit")
  const [proposal, setProposal] = useState(() => keyed(initialProposal))
  const [selectedProducts, setSelectedProducts] = useState(initialSelectedProducts)
  const [revision, setRevision] = useState(initialRevision)
  const [supplierId, setSupplierId] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [sourceDetails, setSourceDetails] = useState<Line | null>(null)
  const sourceReturnFocus = useRef<HTMLElement | null>(null)
  const supplierButton = useRef<HTMLButtonElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Once saving has been tried, what it still needs is marked, and clears as it's filled in.
  const [checking, setChecking] = useState(false)
  const [correct, correcting] = reviewApi.useCorrectImportMutation()
  const [readState, reading] = reviewApi.useLazyImportStateQuery()
  const [save, saving] = reviewApi.useSaveImportMutation()
  const busy = reading.isFetching || correcting.isLoading || saving.isLoading
  const currency = proposal.currency
  // The details saving still needs.
  const missing = {
    supplier: !supplierId,
    reference: !proposal.reference?.trim(),
    currency: !currency
  }

  function edit(change: (draft: ReviewProposal) => void) {
    setProposal((current) => {
      const next = structuredClone(current)
      change(next)
      return next
    })
  }
  function editAt<T>(list: (draft: ReviewProposal) => T[], index: number, change: (item: T) => void) {
    edit((draft) => {
      const item = list(draft)[index]
      if (item) {
        change(item)
      }
    })
  }
  function choose(index: number, variant: CatalogVariant) {
    const product = reviewProduct(variant)
    setSelectedProducts((current) => ({ ...current, [variant.id]: product }))
    editAt(
      (draft) => draft.items,
      index,
      (line) => {
        line.selectedVariantId = variant.id
        line.reason = selectedReason
        // A line added during review has no document text; it takes the product's name.
        if (!line.description.trim()) {
          line.description = [product.title, variantName(product.variant)].filter(Boolean).join(" ")
        }
      }
    )
  }
  function addLine() {
    const key = crypto.randomUUID()
    edit((draft) => {
      draft.items.push({
        key,
        description: "",
        sourceSku: null,
        sourcePage: null,
        sourceQuantity: null,
        sourceUnit: null,
        sourceUnitPrice: null,
        sourceLineTotal: null,
        selectedVariantId: null,
        candidateVariantIds: [],
        pieces: null,
        piecesPerSet: null,
        pricePerPiece: null,
        reason: addedReason,
        warnings: []
      })
    })
    return key
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const unnamed = proposal.items.findIndex((item) => !item.description.trim())
    const incomplete =
      Object.values(missing).some(Boolean) ||
      proposal.items.some((item) => blank(item.pieces) || blank(item.piecesPerSet) || blank(item.pricePerPiece)) ||
      proposal.adjustments.some((charge) => blank(charge.description.trim()) || blank(charge.amount))
    if (incomplete || unnamed !== -1) {
      // The form checks itself, as the app's other forms do, then focuses the first field to fill in.
      const form = event.currentTarget
      flushSync(() => {
        setChecking(true)
        setError(unnamed === -1 ? null : tr("chooseProductForLine", { line: unnamed + 1 }))
      })
      form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus()
      return
    }
    try {
      const current = await readState(id, false).unwrap()
      if (current.status === "saved" && current.orderId) {
        router.navigate({ href: `/orders/${current.orderId}` })
        router.invalidate()
        return
      }
      const corrected = await correct({ id, revision, proposal: unkeyed(proposal) }).unwrap()
      setRevision(corrected.revision)
      const result = await save({
        id,
        revision: corrected.revision,
        supplierId,
        reference: proposal.reference ?? "",
        dueDate: dueDate || undefined
      }).unwrap()
      router.navigate({ href: result.redirect })
      router.invalidate()
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }

  const formId = "import-review"
  return (
    <>
      <PageHeader
        parents={[
          { label: t("index.title"), href: "/orders" },
          { label: t("index.import"), href: "/orders/import" }
        ]}
        title={fileName(filename)}
      >
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={`/api/imports/${id}/source`} target="_blank" rel="noreferrer" aria-label={tr("viewPdf")} />}
        >
          <FileText data-icon="inline-start" />
          {tr("viewPdf")}
        </Button>
        <SubmitButton type="submit" form={formId} pending={busy}>
          {tr("saveDraft")}
        </SubmitButton>
      </PageHeader>
      <FormError message={error ?? undefined} />
      {/* The key handler is delegated from the fields and only keeps Enter from submitting; the form adds no action. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <form id={formId} className="@container" noValidate onSubmit={submit} onKeyDown={keepEnterFromSubmitting}>
        {/* One column, or the lines beside the details and cost summary once there's room, as in the editor. */}
        <fieldset
          disabled={busy}
          className="grid min-w-0 items-start gap-4 @5xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:grid-rows-[auto_1fr]"
        >
          <Card className="@5xl:col-start-2 @5xl:row-start-1">
            <CardHeader>
              <CardTitle>{t("detail.purchaseOrderDetails")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Warnings warnings={proposal.warnings} />
              {!!proposal.notes?.length && (
                <details className="text-sm text-muted-foreground">
                  <summary className="cursor-pointer rounded-sm focus-visible:outline-ring">
                    {tr("importNotes")}
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {proposal.notes.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                </details>
              )}
              <FieldGroup className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-1">
                <div className="flex flex-col gap-2">
                  <SelectField
                    id="import-supplier"
                    label={tr("supplier")}
                    required
                    placeholder={tr("chooseSupplier")}
                    disabled={suppliers.length === 0}
                    description={suppliers.length === 0 ? tr("noSuppliers") : undefined}
                    error={checking && missing.supplier ? tr("chooseSupplier") : undefined}
                    options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                    value={supplierId}
                    onValueChange={setSupplierId}
                  />
                  {canAddSupplier && (
                    <Button
                      ref={supplierButton}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() => setAddingSupplier(true)}
                    >
                      <Plus data-icon="inline-start" />
                      {tr("addSupplier")}
                    </Button>
                  )}
                </div>
                <Field data-invalid={checking && missing.reference}>
                  <FormLabel htmlFor="import-reference" label={tr("reference")} required />
                  <Input
                    id="import-reference"
                    required
                    maxLength={80}
                    aria-invalid={checking && missing.reference}
                    aria-describedby={checking && missing.reference ? "import-reference-error" : undefined}
                    value={proposal.reference ?? ""}
                    onChange={(e) => {
                      const value = e.target.value
                      edit((p) => {
                        p.reference = value
                      })
                    }}
                  />
                  <FieldError id="import-reference-error">
                    {checking && missing.reference ? validation("required") : undefined}
                  </FieldError>
                </Field>
                <Field>
                  <FormLabel htmlFor="import-due-date" label={t("detail.requiredBy")} />
                  <DateInput id="import-due-date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </Field>
                <SelectField
                  id="import-currency"
                  label={t("detail.currency")}
                  required
                  placeholder={tr("chooseCurrency")}
                  error={checking && missing.currency ? tr("chooseCurrency") : undefined}
                  options={currencies.map((code) => ({ value: code, label: t(`currencies.${code}`) }))}
                  value={currency ?? ""}
                  onValueChange={(value) => {
                    if (arrayIncludes(currencies, value)) {
                      edit((p) => {
                        p.currency = value
                      })
                    }
                  }}
                />
              </FieldGroup>
            </CardContent>
          </Card>

          <ImportLines
            id={id}
            lines={proposal.items}
            selectedProducts={selectedProducts}
            currency={currency}
            checking={checking}
            onEditLine={(index, change) => editAt((draft) => draft.items, index, change)}
            onChoose={choose}
            onAddLine={addLine}
            onRemoveLine={(index) =>
              edit((draft) => {
                draft.items.splice(index, 1)
              })
            }
            onSourceDetails={(line, trigger) => {
              sourceReturnFocus.current = trigger
              setSourceDetails(line)
            }}
          />

          <ImportCostSummary
            charges={proposal.adjustments}
            documentTotal={proposal.documentTotal}
            totals={importTotals(proposal)}
            currency={currency}
            checking={checking}
            onAddCharge={() =>
              edit((draft) => {
                draft.adjustments.push({ key: crypto.randomUUID(), description: "", amount: null, sourcePage: 1 })
              })
            }
            onEditCharge={(index, change) => editAt((draft) => draft.adjustments, index, change)}
            onRemoveCharge={(index) =>
              edit((draft) => {
                draft.adjustments.splice(index, 1)
              })
            }
            onDocumentTotalChange={(value) =>
              edit((draft) => {
                draft.documentTotal = value
              })
            }
          />
        </fieldset>
      </form>
      {canAddSupplier && (
        <InviteSupplier open={addingSupplier} onOpenChange={setAddingSupplier} finalFocus={supplierButton} />
      )}
      <Dialog
        open={sourceDetails !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSourceDetails(null)
          }
        }}
      >
        <DialogContent finalFocus={sourceReturnFocus}>
          <DialogHeader>
            <DialogTitle>{tr("sourceDetails")}</DialogTitle>
            <DialogDescription>{sourceDetails?.description}</DialogDescription>
          </DialogHeader>
          {sourceDetails && (
            <>
              <p className="text-sm">{sourceLine(sourceDetails, tr)}</p>
              {sourceDetails.reason && (
                <div className="space-y-1">
                  <p className="font-medium">{tr("matchDetails")}</p>
                  <p className="text-sm text-muted-foreground">{reasonText(sourceDetails.reason, tr)}</p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
