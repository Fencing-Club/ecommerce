"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { prepCategories } from "@repo/aisle"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { Fragment, useState } from "react"
import { FormProvider, useFieldArray, useForm } from "react-hook-form"
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
import { api, errorMessage } from "@/lib/api"
import { casePackSchema } from "@/lib/case-packs"
import { formErrorMap } from "@/lib/form-errors"
import { prepOptions } from "@/lib/prep"
import type { ProductDefaults } from "@/server/product-defaults"
import { FormError } from "./actions"
import { FormInput, FormNumber, FormSelect, FormTextarea } from "./form-controls"
import * as styles from "./inventory-products.css"

const detailsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    productSuppliers: build.query<{ id: string; name: string }[], void>({ query: () => "restock/suppliers" }),
    saveProductDefaults: build.mutation<
      ProductDefaults,
      Omit<ProductDefaults, "revision"> & { productId: string; expectedRevision: number }
    >({
      query: (body) => ({ url: "inventory/product-defaults", method: "PATCH", body })
    })
  })
})

const schema = z.object({
  description: z.string().trim().max(2000),
  // Empty means no default; new PO lines then start with a sealed polybag.
  prepCategory: z.enum(prepCategories).or(z.literal("")),
  minimumOrder: z.number().int().min(1).max(1000000).optional(),
  // Empty means not chosen; restock then uses the last PO or the supplier's catalog.
  supplierId: z.string(),
  casePacks: z.array(casePackSchema.extend({ weightKg: z.number().positive().max(1000).optional() })).max(10)
})

type Variation = { title: string | null; amazonStockTarget: number | null }

// What Shopify holds for this product, shown for reference because it's edited in Shopify.
function FromShopify({ caseQuantity, variants }: { caseQuantity: number | null; variants: Variation[] }) {
  const target = (value: number | null) => {
    if (value === null) {
      return "Not set"
    }
    return value === 0 ? "0, not stocked at Amazon" : `${value} units`
  }
  return (
    <section className={styles.fromShopify} aria-labelledby="from-shopify">
      <h3 id="from-shopify" className={styles.title}>
        From Shopify
      </h3>
      <dl className={styles.facts}>
        <dt>Case quantity</dt>
        <dd>{caseQuantity === null ? "Not set" : `${caseQuantity} units per case`}</dd>
        {variants.length === 1 ? (
          <>
            <dt>Amazon stock target</dt>
            <dd>{target(variants[0]?.amazonStockTarget ?? null)}</dd>
          </>
        ) : (
          variants.map((variant) => (
            <Fragment key={variant.title}>
              <dt>Amazon stock target, {variant.title}</dt>
              <dd>{target(variant.amazonStockTarget)}</dd>
            </Fragment>
          ))
        )}
      </dl>
    </section>
  )
}

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
          <FormInput name={`casePacks.${index}.name`} label="Name" className={styles.casePackName} />
          <FormNumber name={`casePacks.${index}.units`} label="Units per case" min={1} step={1} />
          <FormNumber name={`casePacks.${index}.lengthCm`} label="Length (cm)" min={0} step={0.1} />
          <FormNumber name={`casePacks.${index}.widthCm`} label="Width (cm)" min={0} step={0.1} />
          <FormNumber name={`casePacks.${index}.heightCm`} label="Height (cm)" min={0} step={0.1} />
          <FormNumber name={`casePacks.${index}.weightKg`} label="Weight (kg, optional)" min={0} step={0.01} />
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

// Edits the product details Copacker keeps itself. Titles, SKUs, photos, costs and Amazon identifiers come from Shopify
// and Amazon, so they are edited there.
export function ProductDetails({
  productId,
  title,
  defaults,
  shopifyCaseQuantity,
  variants,
  onSaved
}: {
  productId: string
  title: string
  defaults: ProductDefaults
  shopifyCaseQuantity: number | null
  variants: Variation[]
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [save] = detailsApi.useSaveProductDefaultsMutation()
  const { data: suppliers = [] } = detailsApi.useProductSuppliersQuery(undefined, { skip: !open })
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema, { error: formErrorMap }),
    values: {
      description: defaults.description,
      prepCategory: defaults.prepCategory ?? "",
      minimumOrder: defaults.minimumOrder ?? undefined,
      supplierId: defaults.supplierId ?? "",
      casePacks: defaults.casePacks.map((pack) => ({ ...pack, weightKg: pack.weightKg ?? undefined }))
    }
  })
  const submit = form.handleSubmit(async (values) => {
    try {
      await save({
        productId,
        description: values.description,
        prepCategory: values.prepCategory || null,
        minimumOrder: values.minimumOrder ?? null,
        supplierId: values.supplierId || null,
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
                Details Copacker keeps for this product. Titles, SKUs, photos, costs and Shopify fields are edited in
                Shopify.
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
                name="supplierId"
                label="Supplier"
                description="Restock groups this product under this supplier and uses their lead time."
                placeholder="Not set"
                options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              />
              <FormNumber
                name="minimumOrder"
                label="Minimum order quantity (optional)"
                description="The fewest units worth ordering. Restock never suggests less."
                min={1}
                step={1}
              />
              <CasePacks suggestedUnits={shopifyCaseQuantity} />
              <FromShopify caseQuantity={shopifyCaseQuantity} variants={variants} />
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
