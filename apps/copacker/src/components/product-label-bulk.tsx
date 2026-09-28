"use client"

import { ChevronDown, Download, Search, Tags } from "lucide-react"
import { useState } from "react"
import { useCan } from "@/components/access"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { api, errorMessage } from "@/lib/api"
import { type ProductLabel, productLabels } from "@/lib/product-label"
import { FormError } from "./actions"

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

const labelNames: Record<ProductLabel, string> = {
  standard: "Standard label",
  uploaded: "Uploaded label",
  none: "No label"
}

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
      setStatus(`${updated} ${updated === 1 ? "product" : "products"} set to ${labelNames[productLabel].toLowerCase()}`)
      void refetch()
      onChanged()
    } catch (e) {
      setError(errorMessage(e, "The label type couldn’t be saved. Try again."))
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
            : "The labels couldn’t be made. Try again."
        )
      }
      save(await response.blob(), "Product labels.pdf")
      const skipped = Number(response.headers.get("x-skipped-labels") ?? 0)
      setStatus(
        skipped
          ? `Downloaded, left out ${skipped} ${skipped === 1 ? "variation" : "variations"} without a label`
          : "Downloaded"
      )
    } catch (e) {
      setError(errorMessage(e, "The labels couldn’t be made. Try again."))
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
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <Tags data-icon="inline-start" />
        Manage labels
      </SheetTrigger>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Manage labels</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 border-b p-4">
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search products"
              placeholder="Search products"
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
              Select all {shown.length}
              {query ? " matching" : ""}
            </FieldLabel>
          </Field>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading products…</p>}
          {!isLoading && !shown.length && <p className="p-4 text-sm text-muted-foreground">No products match</p>}
          {!isLoading && shown.length > 0 && (
            <ul aria-label="Products" className="divide-y">
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
                        {choice.variations === 1 ? "1 variation" : `${choice.variations} variations`}
                      </span>
                    </label>
                    <Badge variant={choice.productLabel === "uploaded" ? "secondary" : "outline"}>
                      {labelNames[choice.productLabel]}
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
              {status || `${selected.length} selected`}
            </p>
            <div className="flex flex-wrap gap-2">
              {editable && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button type="button" variant="outline" disabled={!selected.length || busy} />}
                  >
                    Set label type
                    <ChevronDown data-icon="inline-end" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {productLabels.map((productLabel) => (
                      <DropdownMenuItem key={productLabel} onClick={() => void setLabel(productLabel)}>
                        {labelNames[productLabel]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button type="button" disabled={!selected.length || busy} onClick={() => void download()}>
                <Download data-icon="inline-start" />
                {downloading ? "Making labels…" : "Download labels"}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
