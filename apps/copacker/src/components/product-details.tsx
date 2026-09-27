"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { amazonNetworkNames, amazonNetworks, prepCategories } from "@repo/aisle"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet"
import { api, errorMessage, useSuppliersQuery } from "@/lib/api"
import { casePackSchema } from "@/lib/case-packs"
import { formErrorMap } from "@/lib/form-errors"
import { prepOptions } from "@/lib/prep"
import { productLabels } from "@/lib/product-label"
import type { ProductDefaults } from "@/server/product-defaults"
import { FormError } from "./actions"
import { FormCheckbox, FormInput, FormNumber, FormSelect, FormTextarea } from "./form-controls"
import { type BarcodeVariation, ProductBarcodes } from "./product-barcodes"
import { type DetailsVariation, VariationDetails } from "./variation-details"
import * as styles from "./inventory-products.css"

const detailsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    saveProductDefaults: build.mutation<
      ProductDefaults,
      Omit<ProductDefaults, "revision"> & { productId: string; expectedRevision: number }
    >({
      query: (body) => ({ url: "inventory/product-defaults", method: "PATCH", body }),
      invalidatesTags: ["Restock", "ProductSupplier"]
    })
  })
})

const schema = z.object({
  description: z.string().trim().max(2000),
  // Empty means no default; new PO lines then start with a sealed polybag.
  prepCategory: z.enum(prepCategories).or(z.literal("")),
  minimumOrder: z.number().int().min(1).max(1000000).optional(),
  caseQuantity: z.number().int().min(1).max(100000).optional(),
  // Empty means not chosen; restock then uses the last PO or the supplier's catalog.
  supplierId: z.string(),
  productLabel: z.enum(productLabels),
  suffocationWarning: z.boolean(),
  amazonNetwork: z.enum(amazonNetworks),
  casePacks: z.array(casePackSchema.extend({ weightKg: z.number().positive().max(1000).optional() })).max(10)
})

type Variation = BarcodeVariation & DetailsVariation

function CasePacks({ suggestedUnits }: { suggestedUnits: number | null }) {
  const packs = useFieldArray<z.input<typeof schema>, "casePacks">({ name: "casePacks" })
  return (
    <section className={styles.casePacks} aria-labelledby="case-packs">
      <div className={styles.casePacksHeading}>
        <h3 id="case-packs" className={styles.title}>
          Case packs
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={packs.fields.length >= 10}
          onClick={() =>
            packs.append({
              name: packs.fields.length ? `Case ${packs.fields.length + 1}` : "Standard case",
              units: suggestedUnits ?? 1,
              lengthCm: 0,
              widthCm: 0,
              heightCm: 0
            })
          }
        >
          <Plus data-icon="inline-start" />
          Add case pack
        </Button>
      </div>
      <p className={styles.detail}>
        How the supplier packs this product into cartons. The first is the default, and restock rounds orders up to it.
      </p>
      {packs.fields.map((field, index) => (
        <fieldset key={field.id} className={styles.casePack}>
          <legend className={styles.srOnlyLegend}>Case pack {index + 1}</legend>
          <FormInput name={`casePacks.${index}.name`} required label="Name" className={styles.casePackName} />
          <FormNumber name={`casePacks.${index}.units`} required label="Units per case" min={1} step={1} />
          <FormNumber name={`casePacks.${index}.lengthCm`} required label="Length (cm)" min={0} step={0.1} />
          <FormNumber name={`casePacks.${index}.widthCm`} required label="Width (cm)" min={0} step={0.1} />
          <FormNumber name={`casePacks.${index}.heightCm`} required label="Height (cm)" min={0} step={0.1} />
          <FormNumber name={`casePacks.${index}.weightKg`} label="Weight (kg)" min={0} step={0.01} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.casePackRemove}
            aria-label={`Remove case pack ${index + 1}`}
            onClick={() => packs.remove(index)}
          >
            <Trash2 data-icon="inline-start" />
            Remove
          </Button>
        </fieldset>
      ))}
    </section>
  )
}

// Edits the product details Copacker keeps, and its variations' supplier SKUs, ASINs, minimum stock and barcodes.
// Titles, SKUs, photos and costs come from Shopify, so they are edited there.
export function ProductDetails({
  productId,
  title,
  defaults,
  variants,
  onSaved
}: {
  productId: string
  title: string
  defaults: ProductDefaults
  variants: Variation[]
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [save] = detailsApi.useSaveProductDefaultsMutation()
  const { data: suppliers = [] } = useSuppliersQuery(undefined, { skip: !open })
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema, { error: formErrorMap }),
    values: {
      description: defaults.description,
      prepCategory: defaults.prepCategory ?? "",
      minimumOrder: defaults.minimumOrder ?? undefined,
      caseQuantity: defaults.caseQuantity ?? undefined,
      supplierId: defaults.supplierId ?? "",
      productLabel: defaults.productLabel,
      suffocationWarning: defaults.suffocationWarning,
      amazonNetwork: defaults.amazonNetwork,
      casePacks: defaults.casePacks.map((pack) => ({ ...pack, weightKg: pack.weightKg ?? undefined }))
    }
  })
  const productLabel = useWatch({ control: form.control, name: "productLabel" })
  const submit = form.handleSubmit(async (values) => {
    try {
      await save({
        productId,
        description: values.description,
        prepCategory: values.prepCategory || null,
        minimumOrder: values.minimumOrder ?? null,
        caseQuantity: values.caseQuantity ?? null,
        supplierId: values.supplierId || null,
        productLabel: values.productLabel,
        suffocationWarning: values.suffocationWarning,
        amazonNetwork: values.amazonNetwork,
        casePacks: values.casePacks.map((pack) => ({ ...pack, weightKg: pack.weightKg ?? null })),
        expectedRevision: defaults.revision
      }).unwrap()
      setOpen(false)
      onSaved()
    } catch (error) {
      form.setError("root.server", { message: errorMessage(error) })
    }
  })
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="xs" aria-label={`Edit ${title}`} />}>
        <Pencil data-icon="inline-start" />
        Edit
      </SheetTrigger>
      <SheetContent>
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className={styles.detailsForm}>
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>
                Details Copacker keeps for this product. Titles, SKUs, photos, costs and other Shopify fields are edited
                in Shopify.
              </SheetDescription>
            </SheetHeader>
            <div className={styles.locationSettings}>
              <FormTextarea
                name="description"
                label="Default product description"
                description="Added to this product’s PO lines for your supplier, such as materials or labeling notes."
                rows={5}
              />
              <FormSelect
                name="prepCategory"
                label="Default preparation"
                placeholder="Not set (sealed polybag)"
                options={prepOptions}
              />
              <FormSelect
                name="amazonNetwork"
                required
                label="Amazon warehouse"
                description="Where this product's cartons go on POs to Amazon. AWD US cartons hold one SKU each."
                options={amazonNetworks.map((network) => ({ value: network, label: amazonNetworkNames[network] }))}
              />
              <FormCheckbox
                name="suffocationWarning"
                label="Suffocation warning label"
                description="New PO lines ask the supplier to put one on each polybag."
              />
              <FormSelect
                name="supplierId"
                label="Supplier"
                description="Restock groups this product under this supplier and uses their lead time."
                placeholder="Not set"
                options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              />
              <FormNumber
                name="minimumOrder"
                label="Minimum order quantity"
                description="The fewest units worth ordering. Restock never suggests less."
                min={1}
                step={1}
              />
              <FormNumber
                name="caseQuantity"
                label="Case quantity"
                description="Units per case. Restock rounds up to it when there’s no case pack."
                min={1}
                step={1}
              />
              <CasePacks suggestedUnits={defaults.caseQuantity} />
              <FormSelect
                name="productLabel"
                required
                label="Product label"
                description="Standard prints the FNSKU or SKU barcode. Uploaded is your own PDF. POs to Amazon always get a label."
                options={[
                  { value: "standard", label: "Standard label" },
                  { value: "uploaded", label: "Uploaded label" },
                  { value: "none", label: "No label" }
                ]}
              />
              <VariationDetails productTitle={title} variations={variants} onChanged={onSaved} />
              <ProductBarcodes
                productTitle={title}
                productLabel={productLabel}
                variations={variants}
                onChanged={onSaved}
              />
              <FormError message={form.formState.errors.root?.server?.message} />
            </div>
            <SheetFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save"}
              </Button>
            </SheetFooter>
          </form>
        </FormProvider>
      </SheetContent>
    </Sheet>
  )
}
