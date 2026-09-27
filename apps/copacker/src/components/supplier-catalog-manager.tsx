"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import * as styles from "./supplier-catalog-manager.css"
import { sx } from "@/styles/sprinkles.css"

type Product = {
  id: string
  revision: number
  supplierSku: string
  title: string
  active: boolean
  currency: string
  priceMinor: number | null
  priceBasis: string
  piecesPerSellablePack: number
  sellablePacksPerCase: number | null
  notes: string | null
  trackInventory: boolean
  onHand: number
  continueSelling: boolean
}
type Preview = {
  rows: Array<Pick<Product, "supplierSku" | "title" | "currency" | "priceMinor" | "priceBasis">>
  count: number
  created: number
  updated: number
  unchanged: number
  revisionHash: string
  fileHash: string
}
const fields = [
  ["supplierSku", "Supplier SKU"],
  ["title", "Product name"],
  ["currency", "Currency"],
  ["price", "Price"],
  ["priceBasis", "Price per"],
  ["piecesPerSellablePack", "Pieces per sellable pack"],
  ["sellablePacksPerCase", "Sellable packs per case"],
  ["notes", "Notes"]
] as const

function CatalogField({ name, product }: { name: (typeof fields)[number][0]; product: Product | null }) {
  if (name === "currency") {
    return (
      <select name={name} defaultValue={product?.currency ?? "USD"}>
        {["USD", "CNY", "EUR", "GBP", "CAD", "AUD"].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
    )
  }
  if (name === "priceBasis") {
    return (
      <select name={name} defaultValue={product?.priceBasis ?? "piece"}>
        {["piece", "sellable_pack", "case"].map((value) => (
          <option key={value} value={value}>
            {value.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    )
  }
  let value = ""
  if (name === "price") {
    if (product?.priceMinor !== null && product) {
      value = (product.priceMinor / 100).toFixed(2)
    }
  } else if (name === "piecesPerSellablePack") {
    value = String(product?.piecesPerSellablePack ?? 1)
  } else {
    value = String(product?.[name] ?? "")
  }
  const numeric = name === "price" || name === "piecesPerSellablePack" || name === "sellablePacksPerCase"
  let min: number | undefined
  if (name === "price") {
    min = 0
  }
  if (name === "piecesPerSellablePack" || name === "sellablePacksPerCase") {
    min = 1
  }
  return (
    <Input
      name={name}
      required={!["price", "notes", "sellablePacksPerCase"].includes(name)}
      defaultValue={value}
      type={numeric ? "number" : "text"}
      min={min}
      step={name === "price" ? "0.01" : 1}
    />
  )
}

// Whether the product counts stock. New products are made to order, so buyers can order any quantity.
function InventoryFields({ product }: { product: Product | null }) {
  const [tracking, setTracking] = useState(product?.trackInventory ?? false)
  return (
    <>
      <label>
        <input
          name="trackInventory"
          type="checkbox"
          checked={tracking}
          onChange={(event) => setTracking(event.target.checked)}
        />{" "}
        Track inventory
      </label>
      {tracking && (
        <>
          <div className={sx({ display: "grid", gap: 1 })}>
            <label htmlFor="catalog-on-hand">On hand</label>
            <Input
              id="catalog-on-hand"
              name="onHand"
              type="number"
              step={1}
              required
              defaultValue={product?.onHand ?? 0}
            />
          </div>
          <label>
            <input name="continueSelling" type="checkbox" defaultChecked={product?.continueSelling ?? false} /> Continue
            selling when out of stock
          </label>
        </>
      )}
    </>
  )
}

// A tracked product's on hand count, saved when it loses focus.
function StockInput({ product }: { product: Product }) {
  const router = useRouter()
  const [value, setValue] = useState(String(product.onHand))
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function save() {
    const onHand = Number(value)
    if (!value.trim() || !Number.isSafeInteger(onHand)) {
      setValue(String(product.onHand))
      return
    }
    if (onHand === product.onHand) {
      return
    }
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/supplier-catalog/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, onHand })
      })
      if (!response.ok) {
        throw new Error((await response.json()).error ?? "Could not save stock")
      }
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save stock")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={sx({ display: "grid", gap: 1 })}>
      <Input
        type="number"
        step={1}
        value={value}
        disabled={pending}
        aria-label={`On hand for ${product.supplierSku}`}
        aria-invalid={!!error}
        className="w-24"
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
        }}
      />
      {error && <output className="text-xs text-destructive">{error}</output>}
    </div>
  )
}

export function SupplierCatalogManager({ products }: { products: Product[] }) {
  const activeCount = products.filter((product) => product.active).length
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [editing, setEditing] = useState<Product | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")

  async function upload(mode: "preview" | "commit") {
    if (!file) {
      return
    }
    setPending(true)
    setMessage("")
    try {
      const data = new FormData()
      data.set("file", file)
      data.set("mode", mode)
      if (mode === "commit" && preview) {
        data.set("revisionHash", preview.revisionHash)
        data.set("fileHash", preview.fileHash)
      }
      const response = await fetch("/api/supplier-catalog/import", { method: "POST", body: data })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(body.error ?? "Import failed")
      }
      if (mode === "preview") {
        setPreview(body)
      } else {
        setPreview(null)
        setFile(null)
        setMessage(
          body.imported
            ? `${body.created} products added, ${body.updated} updated, ${body.unchanged} unchanged.`
            : "This file was already imported."
        )
        router.refresh()
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed")
    } finally {
      setPending(false)
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setMessage("")
    const data = new FormData(event.currentTarget)
    const price = String(data.get("price") ?? "").trim()
    if (price && !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(price)) {
      setMessage("Price must have at most two decimals.")
      setPending(false)
      return
    }
    const [whole, cents = ""] = price.split(".")
    const body = {
      ...(editing && { id: editing.id, revision: editing.revision }),
      supplierSku: String(data.get("supplierSku") ?? ""),
      title: String(data.get("title") ?? ""),
      currency: String(data.get("currency") ?? "USD"),
      priceMinor: price ? Number(whole) * 100 + Number(cents.padEnd(2, "0")) : null,
      priceBasis: String(data.get("priceBasis") ?? "piece"),
      piecesPerSellablePack: Number(data.get("piecesPerSellablePack")),
      sellablePacksPerCase: data.get("sellablePacksPerCase") ? Number(data.get("sellablePacksPerCase")) : null,
      notes: String(data.get("notes") ?? "") || null,
      active: data.get("active") === "on",
      trackInventory: data.get("trackInventory") === "on",
      // A product that stops tracking keeps its last settings, for when it tracks again.
      onHand: data.has("onHand") ? Number(data.get("onHand")) : (editing?.onHand ?? 0),
      continueSelling: data.has("onHand") ? data.get("continueSelling") === "on" : (editing?.continueSelling ?? false)
    }
    try {
      const response = await fetch("/api/supplier-catalog/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error ?? "Could not save product")
      }
      setEditing(null)
      setDialogOpen(false)
      setMessage("Product saved.")
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save product")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={sx({ display: "grid", gap: 6 })}>
      <Card>
        <CardHeader>
          <CardTitle>Import catalog</CardTitle>
          <CardDescription>
            Use the CSV template. Check the preview before updating your catalog; missing rows do not remove products.
          </CardDescription>
        </CardHeader>
        <CardContent className={sx({ display: "grid", gap: 4 })}>
          <div className={sx({ display: "flex", flexWrap: "wrap", gap: 4 })}>
            <a href="/api/supplier-catalog/export" download>
              Download current catalog
            </a>
            <a href="/api/supplier-catalog/template" download>
              Download blank template
            </a>
          </div>
          <p className={sx({ text: "sm", color: "muted" })}>
            The current catalog includes active products only. Edit the CSV in Excel, keep the supplier SKU for each
            product, and upload it here. Matching SKUs update changed fields; new SKUs add products. Missing rows do not
            remove products. Archived products stay out of the export and can be restored individually.
          </p>
          <Input
            type="file"
            accept=".csv,text/csv"
            aria-label="Catalog CSV file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setPreview(null)
            }}
          />
          <div>
            <Button type="button" disabled={!file || pending} onClick={() => upload("preview")}>
              Preview import
            </Button>
          </div>
          {preview && (
            <>
              <p>
                {preview.count} rows validated: {preview.created} new, {preview.updated} to update, {preview.unchanged}{" "}
                unchanged.{" "}
                {preview.rows.length ? "Review the sample below, then import." : "This file has no products."}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.slice(0, 20).map((row) => (
                    <TableRow key={row.supplierSku}>
                      <TableCell>{row.supplierSku}</TableCell>
                      <TableCell>{row.title}</TableCell>
                      <TableCell>
                        {row.priceMinor === null
                          ? "Needs price"
                          : `${row.currency} ${(row.priceMinor / 100).toFixed(2)} / ${row.priceBasis}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div>
                <Button type="button" disabled={pending || preview.count === 0} onClick={() => upload("commit")}>
                  Import {preview.count} products
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>
            {activeCount} active products
            {activeCount < products.length && `, ${products.length - activeCount} archived`}
          </CardDescription>
        </CardHeader>
        <CardContent className={sx({ display: "grid", gap: 4 })}>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(null)
                setMessage("")
                setDialogOpen(true)
              }}
            >
              Add product
            </Button>
          </div>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              if (!pending) {
                setDialogOpen(open)
              }
            }}
          >
            <DialogContent className={styles.productDialog}>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle>
                <DialogDescription>
                  {editing
                    ? `Update ${editing.supplierSku} in your catalog.`
                    : "Add a product to your supplier catalog."}
                </DialogDescription>
              </DialogHeader>
              <form key={editing?.id ?? "new"} onSubmit={save} className={sx({ display: "grid", gap: 3 })}>
                {fields.map(([name, label]) => (
                  <label key={name} className={sx({ display: "grid", gap: 1 })}>
                    {label}
                    <CatalogField name={name} product={editing} />
                  </label>
                ))}
                <InventoryFields product={editing} />
                <label>
                  <input name="active" type="checkbox" defaultChecked={editing?.active ?? true} /> Active product
                </label>
                {message && <output>{message}</output>}
                <DialogFooter>
                  <Button type="button" variant="outline" disabled={pending} onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    Save product
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Pack</TableHead>
                <TableHead>On hand</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>{product.supplierSku}</TableCell>
                  <TableCell>
                    {product.title}
                    {!product.active && " (archived)"}
                  </TableCell>
                  <TableCell>
                    {product.priceMinor === null
                      ? "Needs price"
                      : `${product.currency} ${(product.priceMinor / 100).toFixed(2)} / ${product.priceBasis}`}
                  </TableCell>
                  <TableCell>
                    {product.piecesPerSellablePack} {product.piecesPerSellablePack === 1 ? "piece" : "pieces"} per
                    sellable pack.{" "}
                    {product.sellablePacksPerCase === null
                      ? "case count unknown"
                      : `${product.sellablePacksPerCase} packs per case (${product.piecesPerSellablePack * product.sellablePacksPerCase} pieces)`}
                  </TableCell>
                  <TableCell>
                    {product.trackInventory ? (
                      <StockInput key={`${product.id}:${product.revision}`} product={product} />
                    ) : (
                      <span className={sx({ color: "muted" })}>Not tracked</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Edit ${product.supplierSku}`}
                      onClick={() => {
                        setEditing(product)
                        setMessage("")
                        setDialogOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {message && !dialogOpen && <output>{message}</output>}
    </div>
  )
}
