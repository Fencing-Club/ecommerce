import { ChevronDown, Download, Search, Tags } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { FormError } from "@/components/form-feedback"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useErrorMessage } from "@/hooks/use-error-text"
import { api } from "@/lib/api"
import type { ProductLabel } from "@/lib/product-label"
import { productLabels } from "@/lib/product-label"

type Choice = { productId: string; title: string; variations: number; productLabel: ProductLabel }

const labelsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    productLabelChoices: build.query<Choice[], void>({ query: () => "inventory/product-labels", keepUnusedDataFor: 0 }),
    assignProductLabel: build.mutation<{ updated: number }, { productIds: string[]; productLabel: ProductLabel }>({
      query: (body) => ({ url: "inventory/product-labels", method: "PATCH", body })
    })
  })
})

// Saves a PDF the browser received, under the name the server gave it.
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

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
  const [downloading, setDownloading] = useState(false)
  const { data: choices = [], isLoading, refetch } = labelsApi.useProductLabelChoicesQuery(undefined, { skip: !open })
  const [assign, { isLoading: assigning }] = labelsApi.useAssignProductLabelMutation()
  // Downloading labels only reads products; setting their label type changes them.
  const editable = useCan("products", "edit")
  const query = search.trim().toLocaleLowerCase()
  const shown = query ? choices.filter((choice) => choice.title.toLocaleLowerCase().includes(query)) : choices
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
    setDownloading(true)
    try {
      const response = await fetch("/api/inventory/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: selected })
      })
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        throw new Error(
          typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
            ? body.error
            : t("labels.downloadFailed")
        )
      }
      save(await response.blob(), t("labels.fileName"))
      const skipped = Number(response.headers.get("x-skipped-labels") ?? 0)
      setStatus(skipped ? t("labels.downloadedSkipped", { count: skipped }) : t("labels.downloaded"))
    } catch (e) {
      setError(errorMessage(e, t("labels.downloadFailed")))
    } finally {
      setDownloading(false)
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
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={t("labels.search")}
              placeholder={t("labels.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
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
