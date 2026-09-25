"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { prepCategories } from "@repo/aisle"
import { Pencil } from "lucide-react"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
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
import { formErrorMap } from "@/lib/form-errors"
import { prepOptions } from "@/lib/prep"
import type { ProductDefaults } from "@/server/product-defaults"
import { FormError } from "./actions"
import { FormSelect, FormTextarea } from "./form-controls"
import * as styles from "./inventory-products.css"

const detailsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
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
  prepCategory: z.enum(prepCategories).or(z.literal(""))
})

// Edits the product details Copacker keeps itself. Titles, SKUs, photos, costs and Amazon identifiers come from Shopify
// and Amazon, so they are edited there.
export function ProductDetails({
  productId,
  title,
  defaults,
  onSaved
}: {
  productId: string
  title: string
  defaults: ProductDefaults
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [save] = detailsApi.useSaveProductDefaultsMutation()
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema, { error: formErrorMap }),
    values: { description: defaults.description, prepCategory: defaults.prepCategory ?? "" }
  })
  const submit = form.handleSubmit(async (values) => {
    try {
      await save({
        productId,
        description: values.description,
        prepCategory: values.prepCategory || null,
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
                Defaults for new PO lines. Titles, SKUs, photos and costs come from Shopify and Amazon.
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
