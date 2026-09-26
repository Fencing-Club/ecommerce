"use client"

import { Download, Tags } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet"
import { api, errorMessage } from "@/lib/api"
import type { ProductLabel } from "@/lib/product-label"
import { FormError } from "./actions"
import * as styles from "./product-label-bulk.css"

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

const labelNames: Record<ProductLabel, string> = { standard: "Standard label", uploaded: "Uploaded label" }

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
  const query = search.trim().toLocaleLowerCase()
  const shown = query ? choices.filter((choice) => choice.title.toLocaleLowerCase().includes(query)) : choices
  const allShown = shown.length > 0 && shown.every((choice) => selected.includes(choice.productId))
  const busy = assigning || downloading

  function toggle(productId: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, productId] : current.filter((id) => id !== productId)))
  }

  async function setLabel(productLabel: ProductLabel) {
    setError("")
    setStatus("")
    try {
      const { updated } = await assign({ productIds: selected, productLabel }).unwrap()
      setStatus(
        `${updated} ${updated === 1 ? "product" : "products"} set to ${labelNames[productLabel].toLowerCase()}.`
      )
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
          ? `Downloaded. ${skipped} ${skipped === 1 ? "variation has" : "variations have"} no label yet and ${skipped === 1 ? "was" : "were"} left out.`
          : "Downloaded."
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
      <SheetContent>
        <div className={styles.panel}>
          <SheetHeader>
            <SheetTitle>Manage labels</SheetTitle>
            <SheetDescription>
              Choose products to set their label type or download all their labels as one PDF. Use Uploaded label for
              products whose labels show more, such as size measurements on uniforms.
            </SheetDescription>
          </SheetHeader>
          <div className={styles.body}>
            <Field>
              <FieldLabel htmlFor="label-products-search">Search products</FieldLabel>
              <Input
                id="label-products-search"
                type="search"
                placeholder="Product name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            {isLoading ? (
              <p className={styles.detail}>Loading products…</p>
            ) : (
              <>
                <Field orientation="horizontal">
                  <Checkbox
                    id="label-products-all"
                    checked={allShown}
                    disabled={!shown.length}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...new Set([...current, ...shown.map((choice) => choice.productId)])]
                          : current.filter((id) => !shown.some((choice) => choice.productId === id))
                      )
                    }
                  />
                  <FieldLabel htmlFor="label-products-all">
                    Select all {shown.length} {query ? "matching" : ""} {shown.length === 1 ? "product" : "products"}
                  </FieldLabel>
                </Field>
                <ul className={styles.list} aria-label="Products">
                  {shown.map((choice) => {
                    const id = `label-product-${choice.productId}`
                    return (
                      <li key={choice.productId} className={styles.row}>
                        <Checkbox
                          id={id}
                          checked={selected.includes(choice.productId)}
                          onCheckedChange={(checked) => toggle(choice.productId, checked)}
                        />
                        <label htmlFor={id} className={styles.name}>
                          <span className={styles.title}>{choice.title}</span>
                          <span className={styles.detail}>
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
                {!shown.length && <p className={styles.detail}>No products match.</p>}
              </>
            )}
          </div>
          <SheetFooter className={styles.footer}>
            <p className={styles.detail} aria-live="polite">
              {status || `${selected.length} ${selected.length === 1 ? "product" : "products"} selected`}
            </p>
            <FormError message={error} />
            <div className={styles.actions}>
              <Button
                type="button"
                variant="outline"
                disabled={!selected.length || busy}
                onClick={() => void setLabel("uploaded")}
              >
                Use uploaded labels
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!selected.length || busy}
                onClick={() => void setLabel("standard")}
              >
                Use standard labels
              </Button>
              <Button type="button" disabled={!selected.length || busy} onClick={() => void download()}>
                <Download data-icon="inline-start" />
                {downloading ? "Making labels…" : "Download labels"}
              </Button>
            </div>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
