"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { amazonNetworkNames, amazonNetworks, type PrepCategory, prepCategories } from "@repo/aisle"
import { ImageOff, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import Image from "next/image"
import { useId, useState } from "react"
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import { useCan } from "@/components/access"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet"
import { useErrorMessage, useFormErrorMap } from "@/hooks/use-error-text"
import { api, useSuppliersQuery } from "@/lib/api"
import { casePackSchema } from "@/lib/case-packs"
import { prepOptions } from "@/lib/prep"
import { productLabels } from "@/lib/product-label"
import { cn } from "@/lib/utils"
import type { ProductDefaults } from "@/server/product-defaults"
import { FormError, SubmitButton } from "./actions"
import { FormCheckbox, FormInput, FormNumber, FormTextarea } from "./form-controls"
import { FormSelect } from "./form-select"
import { type BarcodeVariation, ProductBarcodes } from "./product-barcodes"
import {
  sameVariation,
  useSaveVariationDetailsMutation,
  VariationDetails,
  type VariationFields,
  variationInput,
  variationSchema,
  variationValues
} from "./variation-details"

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

// New PO lines get a sealed polybag when the product has no preparation of its own, so that's what an unset one shows.
const defaultPrep: PrepCategory = "POLYBAGGING"
const networkOptions = amazonNetworks.map((network) => ({ value: network, label: amazonNetworkNames[network] }))
const wholeNumber = "products.details.enterWholeNumber"

const schema = z.object({
  supplierId: z.string(),
  minimumOrder: z.number().int(wholeNumber).min(1).max(1000000).optional(),
  amazonNetwork: z.enum(amazonNetworks),
  prepCategory: z.enum(prepCategories),
  suffocationWarning: z.boolean(),
  description: z.string().trim().max(2000),
  caseQuantity: z.number().int(wholeNumber).min(1).max(100000).optional(),
  casePacks: z.array(casePackSchema.extend({ weightKg: z.number().positive().max(1000).optional() })).max(10),
  productLabel: z.enum(productLabels),
  variations: z.array(variationSchema)
})
type Values = z.input<typeof schema>
type Output = z.output<typeof schema>
type Details = Omit<ProductDefaults, "revision">

export type EditableProduct = {
  productId: string
  title: string
  imageUrl: string | null
  defaults: ProductDefaults
  variants: (BarcodeVariation & VariationFields & { sku: string | null })[]
}

// A product's Shopify photo, or a placeholder. Shopify's CDN already serves a thumbnail, so Next's optimizer is skipped.
export function ProductImage({ url, small = false }: { url: string | null; small?: boolean }) {
  const size = small ? "size-8" : "size-10"
  if (!url) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground [&_svg]:size-4",
          size
        )}
      >
        <ImageOff />
      </span>
    )
  }
  const pixels = small ? 32 : 40
  return (
    <Image
      src={url}
      alt=""
      width={pixels}
      height={pixels}
      unoptimized
      className={cn("shrink-0 rounded-md border bg-muted object-cover", size)}
    />
  )
}

function formValues({ defaults, variants }: EditableProduct): Values {
  return {
    supplierId: defaults.supplierId ?? "",
    minimumOrder: defaults.minimumOrder ?? undefined,
    amazonNetwork: defaults.amazonNetwork,
    prepCategory: defaults.prepCategory ?? defaultPrep,
    suffocationWarning: defaults.suffocationWarning,
    description: defaults.description,
    caseQuantity: defaults.caseQuantity ?? undefined,
    casePacks: defaults.casePacks.map((pack) => ({ ...pack, weightKg: pack.weightKg ?? undefined })),
    productLabel: defaults.productLabel,
    variations: variants.map(variationValues)
  }
}

function details(values: Output, saved: ProductDefaults): Details {
  return {
    description: values.description,
    // Leaving an unset preparation on sealed polybag keeps it unset.
    prepCategory: values.prepCategory === defaultPrep && saved.prepCategory === null ? null : values.prepCategory,
    casePacks: values.casePacks.map((pack) => ({ ...pack, weightKg: pack.weightKg ?? null })),
    caseQuantity: values.caseQuantity ?? null,
    minimumOrder: values.minimumOrder ?? null,
    supplierId: values.supplierId || null,
    productLabel: values.productLabel,
    suffocationWarning: values.suffocationWarning,
    amazonNetwork: values.amazonNetwork
  }
}

// The same string for the same details, whatever order their keys arrived in.
function detailsKey(input: Details) {
  return JSON.stringify([
    input.description,
    input.prepCategory,
    input.caseQuantity,
    input.minimumOrder,
    input.supplierId,
    input.productLabel,
    input.suffocationWarning,
    input.amazonNetwork,
    input.casePacks.map((pack) => [pack.name, pack.units, pack.lengthCm, pack.widthCm, pack.heightCm, pack.weightKg])
  ])
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      {children}
    </section>
  )
}

function CasePacks() {
  const t = useTranslations("products.details")
  const packs = useFieldArray<Values, "casePacks">({ name: "casePacks" })
  const caseQuantity = useWatch<Values, "caseQuantity">({ name: "caseQuantity" })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium">{t("casePacks")}</h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={packs.fields.length >= 10}
          onClick={() =>
            packs.append({
              name: packs.fields.length ? t("caseName", { number: packs.fields.length + 1 }) : t("standardCase"),
              units: caseQuantity ?? 1,
              lengthCm: 0,
              widthCm: 0,
              heightCm: 0
            })
          }
        >
          <Plus data-icon="inline-start" />
          {t("addCasePack")}
        </Button>
      </div>
      {packs.fields.map((field, index) => (
        <fieldset key={field.id} className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-4">
          <legend className="sr-only">{t("casePack", { number: index + 1 })}</legend>
          <FormInput name={`casePacks.${index}.name`} required label={t("name")} className="col-span-2" />
          <FormNumber name={`casePacks.${index}.units`} required label={t("unitsPerCase")} min={1} step={1} />
          <div className="flex items-center justify-end gap-2 self-start">
            {/* Restock rounds orders up to the first case pack. */}
            {index === 0 && packs.fields.length > 1 && <Badge variant="secondary">{t("defaultCasePack")}</Badge>}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              aria-label={t("removeCasePack", { number: index + 1 })}
              onClick={() => packs.remove(index)}
            >
              <Trash2 />
            </Button>
          </div>
          <FormNumber name={`casePacks.${index}.lengthCm`} required label={t("lengthCm")} min={0} step={0.1} />
          <FormNumber name={`casePacks.${index}.widthCm`} required label={t("widthCm")} min={0} step={0.1} />
          <FormNumber name={`casePacks.${index}.heightCm`} required label={t("heightCm")} min={0} step={0.1} />
          <FormNumber name={`casePacks.${index}.weightKg`} label={t("weightKg")} min={0} step={0.01} />
        </fieldset>
      ))}
    </div>
  )
}

function DetailsForm({
  product,
  onSaved,
  onDone
}: {
  product: EditableProduct
  onSaved: () => void
  onDone: () => void
}) {
  const t = useTranslations("products")
  const shipments = useTranslations("shipments")
  const { productId, title, defaults, variants } = product
  const [saveProduct] = detailsApi.useSaveProductDefaultsMutation()
  const [saveVariation] = useSaveVariationDetailsMutation()
  const { data: suppliers = [], isLoading: loadingSuppliers } = useSuppliersQuery()
  // Someone who can only view products sees the details with their fields turned off; labels still preview and
  // download.
  const editable = useCan("products", "edit")
  const errorMap = useFormErrorMap()
  const errorMessage = useErrorMessage()
  const form = useForm<Values, unknown, Output>({
    resolver: zodResolver(schema, { error: errorMap }),
    defaultValues: formValues(product)
  })
  const productLabel = useWatch({ control: form.control, name: "productLabel" })
  const labelOptions = productLabels.map((value) => ({ value, label: t(`labelTypes.${value}`) }))
  // What the server holds, so saving again after a failure sends only what didn't save.
  const [saved, setSaved] = useState(() => ({
    revision: defaults.revision,
    details: detailsKey(defaults),
    variations: new Map(variants.map((variant) => [variant.variantId, variationInput(variationValues(variant))]))
  }))
  const only = variants.length === 1 && variants[0]?.title === null ? variants[0] : null

  // Saves the product's details, then each changed variation. A failure stops there and keeps the panel open.
  const submit = form.handleSubmit(async (values) => {
    const next = { ...saved, variations: new Map(saved.variations) }
    let changed = false
    const fail = (message: string) => {
      setSaved(next)
      form.setError("root.server", { message })
      if (changed) {
        onSaved()
      }
    }
    const input = details(values, defaults)
    if (detailsKey(input) !== next.details) {
      try {
        const result = await saveProduct({ productId, ...input, expectedRevision: next.revision }).unwrap()
        next.revision = result.revision
        next.details = detailsKey(input)
        changed = true
      } catch (error) {
        fail(errorMessage(error))
        return
      }
    }
    for (const variation of values.variations) {
      const fields = variationInput(variation)
      const before = next.variations.get(variation.variantId)
      if (before && sameVariation(before, fields)) {
        continue
      }
      try {
        await saveVariation({ variantId: variation.variantId, ...fields }).unwrap()
        next.variations.set(variation.variantId, fields)
        changed = true
      } catch (error) {
        const name = variants.find((variant) => variant.variantId === variation.variantId)?.title
        fail(name ? t("details.variationError", { name, message: errorMessage(error) }) : errorMessage(error))
        return
      }
    }
    onDone()
    if (changed) {
      onSaved()
    }
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <SheetHeader className="flex-row items-center gap-3 border-b pe-12">
          <ProductImage url={product.imageUrl} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="line-clamp-2">{title}</SheetTitle>
            <SheetDescription className="text-xs">
              {only ? (only.sku ?? t("details.noSku")) : t("details.variationCount", { count: variants.length })}
            </SheetDescription>
          </div>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          <fieldset disabled={!editable} className="flex min-w-0 flex-col gap-6">
            <Section title={t("details.purchasing")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormSelect
                  name="supplierId"
                  label={t("details.supplier")}
                  options={[
                    // An empty supplier leaves restock to find one: from Shopify, the last PO, or a supplier catalog.
                    { value: "", label: t("details.automaticSupplier") },
                    ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))
                  ]}
                  placeholder={loadingSuppliers ? t("details.loading") : "—"}
                />
                {only && (
                  <FormInput
                    name="variations.0.supplierSku"
                    label={t("details.supplierSku")}
                    maxLength={255}
                    autoComplete="off"
                    spellCheck={false}
                  />
                )}
                <FormNumber name="minimumOrder" label={t("details.minimumOrder")} min={1} step={1} />
                {only && (
                  <FormNumber
                    name="variations.0.storeStockTarget"
                    label={t("details.warehouseMinimum")}
                    min={0}
                    step={1}
                  />
                )}
              </div>
            </Section>
            <Separator />
            <Section title="Amazon">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormSelect
                  name="amazonNetwork"
                  required
                  label={t("details.amazonWarehouse")}
                  options={networkOptions}
                />
                {only && (
                  <FormInput
                    name="variations.0.asin"
                    label="ASIN"
                    maxLength={255}
                    autoComplete="off"
                    spellCheck={false}
                  />
                )}
                {only && (
                  <FormNumber
                    name="variations.0.amazonStockTarget"
                    label={t("details.amazonMinimum")}
                    description={t("details.amazonMinimumHint")}
                    min={0}
                    step={1}
                  />
                )}
              </div>
            </Section>
            <Separator />
            <Section title={t("details.packing")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormSelect
                  name="prepCategory"
                  required
                  label={t("details.preparation")}
                  options={prepOptions(shipments)}
                />
                <FormNumber
                  name="caseQuantity"
                  label={t("details.caseQuantity")}
                  description={t("details.caseQuantityHint")}
                  min={1}
                  step={1}
                />
              </div>
              <FormCheckbox name="suffocationWarning" label={t("details.suffocationWarning")} />
              <FormTextarea
                name="description"
                label={t("details.instructions")}
                placeholder={t("details.instructionsPlaceholder")}
              />
              <CasePacks />
            </Section>
            <Separator />
          </fieldset>
          <Section title={t("details.labels")}>
            <fieldset disabled={!editable} className="grid min-w-0 gap-4 sm:grid-cols-2">
              <FormSelect
                name="productLabel"
                required
                label={t("details.productLabel")}
                description={t(`details.labelHints.${productLabel}`)}
                options={labelOptions}
              />
            </fieldset>
            <ProductBarcodes
              productTitle={title}
              productLabel={productLabel}
              variations={variants}
              onChanged={onSaved}
            />
          </Section>
          {!only && (
            <>
              <Separator />
              <Section title={t("details.variations")}>
                <fieldset disabled={!editable} className="min-w-0">
                  <VariationDetails productTitle={title} variations={variants} />
                </fieldset>
              </Section>
            </>
          )}
        </div>
        <SheetFooter className="border-t">
          <FormError message={form.formState.errors.root?.server?.message} />
          <div className="flex justify-end gap-2">
            <SheetClose render={<Button type="button" variant="outline" />}>
              {editable ? t("details.cancel") : t("details.close")}
            </SheetClose>
            {editable && (
              <SubmitButton type="submit" pending={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
                {t("details.save")}
              </SubmitButton>
            )}
          </div>
        </SheetFooter>
      </form>
    </FormProvider>
  )
}

// The details Copacker keeps for a product and its variations, in one side panel with one Save. Titles, SKUs, photos
// and costs come from Shopify, so they're edited there. Label uploads save right away.
export function ProductDetails({
  product,
  open,
  onOpenChange,
  onSaved
}: {
  product: EditableProduct | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {product && (
          <DetailsForm key={product.productId} product={product} onSaved={onSaved} onDone={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  )
}
