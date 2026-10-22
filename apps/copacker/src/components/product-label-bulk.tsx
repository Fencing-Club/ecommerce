import { ChevronDown, Download, Tags } from "lucide-react"
import { useState } from "react"
import invariant from "tiny-invariant"
import { useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { FormError } from "@/components/form-feedback"
import { matches } from "@/components/list/matches"
import { SearchField } from "@/components/list/search-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useErrorMessage } from "@/hooks/use-error-text"
import { api } from "@/lib/api"
import { downloadBlob, fileOrError } from "@/lib/download"
import type { ProductLabel } from "@/lib/product-label"
import { productLabels } from "@/lib/product-label"

type Choice = { productId: string; title: string; variations: number; productLabel: ProductLabel }

const labelsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    productLabelChoices: build.query<Choice[], void>({ query: () => "inventory/product-labels", keepUnusedDataFor: 0 }),
    assignProductLabel: build.mutation<{ updated: number }, { productIds: string[]; productLabel: ProductLabel }>({
      query: (body) => ({ url: "inventory/product-labels", method: "PATCH", body })
    }),
    // Every variation's label of the chosen products as one PDF, saved as `filename`. The PDF goes straight to the
    // download rather than into the store, which keeps only plain data. The result counts the variations left out
    // because they have no label yet.
    downloadProductLabels: build.mutation<{ skipped: number }, { productIds: string[]; filename: string }>({
      queryFn: async ({ productIds, filename }, _api, _extraOptions, baseQuery) => {
        const result = await baseQuery({
          url: "inventory/labels",
          method: "POST",
          body: { productIds },
          responseHandler: fileOrError
        })
        if (result.error) {
          return { error: result.error }
        }
        invariant(result.data instanceof Blob, "A label PDF arrives as a Blob")
        downloadBlob(result.data, filename)
        return { data: { skipped: Number(result.meta?.response?.headers.get("x-skipped-labels") ?? 0) } }
      }
    })
  })
})

// Chooses several products at once to set their label type, such as marking uniforms as needing uploaded labels, or to
// download all their labels as one PDF.
export function ProductLabelBulk({ onChanged }: { onChanged: () => void }) {
  const t = useTranslations("products")
  const errorMessage = useErrorMessage()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const { data: choices = [], isLoading, refetch } = labelsApi.useProductLabelChoicesQuery(undefined, { skip: !open })
  const [assign, { isLoading: assigning }] = labelsApi.useAssignProductLabelMutation()
  const [downloadLabels, { isLoading: downloading }] = labelsApi.useDownloadProductLabelsMutation()
  // Downloading labels only reads products; setting their label type changes them.
  const editable = useCan("products", "edit")
  const query = search.trim()
  const shown = choices.filter((choice) => matches(search, choice.title))
  const allShown = shown.length > 0 && shown.every((choice) => selected.includes(choice.productId))
  const someShown = shown.some((choice) => selected.includes(choice.productId))
  const busy = assigning || downloading

  function toggle(productId: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, productId] : current.filter((id) => id !== productId)))
  }

  async function setLabel(productLabel: ProductLabel) {
    setError("")
    setStatus("")
    try {
      const { updated } = await assign({ productIds: selected, productLabel }).unwrap()
      setStatus(t("labels.assigned", { count: updated, label: productLabel }))
      void refetch()
      onChanged()
    } catch (e) {
      setError(errorMessage(e, t("labels.assignFailed")))
    }
  }

  async function download() {
    setError("")
    setStatus("")
    try {
      const { skipped } = await downloadLabels({ productIds: selected, filename: t("labels.fileName") }).unwrap()
      setStatus(skipped ? t("labels.downloadedSkipped", { count: skipped }) : t("labels.downloaded"))
    } catch (e) {
      setError(errorMessage(e, t("labels.downloadFailed")))
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setSelected([])
          setSearch("")
          setStatus("")
          setError("")
        }
      }}
    >
      <SheetTrigger render={<Button variant="outline" />}>
        <Tags data-icon="inline-start" />
        {t("labels.manage")}
      </SheetTrigger>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("labels.manage")}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 border-b p-4">
          <SearchField label={t("labels.search")} value={search} onChange={setSearch} />
          <Field orientation="horizontal">
            <Checkbox
              id="label-products-all"
              checked={allShown}
              indeterminate={someShown && !allShown}
              disabled={isLoading || !shown.length}
              onCheckedChange={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...new Set([...current, ...shown.map((choice) => choice.productId)])]
                    : current.filter((id) => !shown.some((choice) => choice.productId === id))
                )
              }
            />
            <FieldLabel htmlFor="label-products-all" className="font-normal">
              {query
                ? t("labels.selectAllMatching", { count: shown.length })
                : t("labels.selectAll", { count: shown.length })}
            </FieldLabel>
          </Field>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">{t("labels.loading")}</p>}
          {!isLoading && !shown.length && <p className="p-4 text-sm text-muted-foreground">{t("labels.noMatch")}</p>}
          {!isLoading && shown.length > 0 && (
            <ul aria-label={t("labels.products")} className="divide-y">
              {shown.map((choice) => {
                const id = `label-product-${choice.productId}`
                return (
                  <li key={choice.productId} className="flex items-center gap-3 px-4 py-2.5">
                    <Checkbox
                      id={id}
                      checked={selected.includes(choice.productId)}
                      onCheckedChange={(checked) => toggle(choice.productId, checked)}
                    />
                    <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium [overflow-wrap:anywhere]">{choice.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {t("labels.variationCount", { count: choice.variations })}
                      </span>
                    </label>
                    <Badge variant={choice.productLabel === "uploaded" ? "secondary" : "outline"}>
                      {t(`labelTypes.${choice.productLabel}`)}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <SheetFooter className="border-t">
          <FormError message={error} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {status || t("labels.selected", { count: selected.length })}
            </p>
            <div className="flex flex-wrap gap-2">
              {editable && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button type="button" variant="outline" disabled={!selected.length || busy} />}
                  >
                    {t("labels.setType")}
                    <ChevronDown data-icon="inline-end" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {productLabels.map((productLabel) => (
                      <DropdownMenuItem key={productLabel} onClick={() => void setLabel(productLabel)}>
                        {t(`labelTypes.${productLabel}`)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button type="button" disabled={!selected.length || busy} onClick={() => void download()}>
                <Download data-icon="inline-start" />
                {downloading ? t("labels.making") : t("labels.download")}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
