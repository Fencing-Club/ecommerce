"use client"

import type { ShopifyLocationKind } from "@repo/aisle/shopify"
import { MapPin } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { useErrorMessage } from "@/hooks/use-error-text"
import { api } from "@/lib/api"
import type { LocationClassification } from "@/server/inventory-locations"
import { FormError } from "./actions"

type LocationSetting = {
  locationId: string
  name: string
  kind: ShopifyLocationKind | null
  classification: LocationClassification
  revision: number
}
type LocationSettings = { snapshotId: string | null; locations: LocationSetting[] }

const locationsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    inventoryLocationSettings: build.query<LocationSettings, void>({
      query: () => "inventory/locations",
      keepUnusedDataFor: 0,
      providesTags: ["InventoryLocation"]
    }),
    saveInventoryLocation: build.mutation<
      unknown,
      { locationId: string; classification: LocationClassification; snapshotId: string; expectedRevision: number }
    >({
      query: (body) => ({ url: "inventory/locations", method: "PATCH", body }),
      // The checkbox shows the saved setting, and which locations count changes restock's numbers.
      invalidatesTags: ["InventoryLocation", "Restock"]
    })
  })
})

// One setting of a connected account: its name, its value beneath, and a button to change it on the right.
export function DetailRow({
  title,
  icon,
  action,
  children
}: {
  title: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      {icon && (
        <span className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-4" aria-hidden>
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="flex items-center gap-2 text-sm font-medium">{title}</h3>
        <div className="text-xs leading-relaxed break-words text-muted-foreground">{children}</div>
      </div>
      {action}
    </div>
  )
}

// Why an app-managed location is usually left out, as its message's key under "inventory.locations.notes".
const notes: Partial<Record<ShopifyLocationKind, "amazonFulfillment" | "shopifyCollective" | "fulfillmentService">> = {
  amazon_fulfillment: "amazonFulfillment",
  shopify_collective: "shopifyCollective",
  fulfillment_service: "fulfillmentService"
}

// Left out, Amazon's location still marks FBA mirror stock for sales attribution; other locations are excluded.
function leftOut(kind: ShopifyLocationKind | null): LocationClassification {
  return kind === "amazon_fulfillment" ? "amazon_mirror" : "excluded"
}

function LocationRow({
  location,
  checked,
  onCheckedChange
}: {
  location: LocationSetting
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const t = useTranslations("inventory.locations")
  const id = `location-${location.locationId.split("/").at(-1)}`
  const note = location.kind && notes[location.kind]
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <FieldContent>
        <FieldLabel htmlFor={id}>{location.name}</FieldLabel>
        {note && <FieldDescription>{t(`notes.${note}`)}</FieldDescription>}
      </FieldContent>
    </Field>
  )
}

function productsLink(chunks: React.ReactNode) {
  return (
    <Link href="/products" className="underline underline-offset-4 hover:text-foreground">
      {chunks}
    </Link>
  )
}

// The Shopify locations that count as the buyer's stock, with a dialog to choose them. Locations run by apps start
// unticked, and Amazon's FBA stock comes from Amazon directly.
export function InventoryLocations() {
  const t = useTranslations("inventory.locations")
  const errorMessage = useErrorMessage()
  const { data, isLoading, isError, error } = locationsApi.useInventoryLocationSettingsQuery()
  const snapshotId = data?.snapshotId
  const included = data?.locations.filter((location) => location.classification === "merchant") ?? []
  return (
    <DetailRow
      icon={<MapPin />}
      title={t("title")}
      action={snapshotId && data && <EditLocations locations={data.locations} snapshotId={snapshotId} />}
    >
      {isLoading && (
        <output className="block">
          <Skeleton className="h-5 w-48" />
          <span className="sr-only">{t("loading")}</span>
        </output>
      )}
      {isError && (
        <p role="alert" className="text-destructive">
          {errorMessage(error, t("loadFailed"))}
        </p>
      )}
      {data && !snapshotId && (
        <p>
          {t.rich("syncFirst", {
            link: productsLink
          })}
        </p>
      )}
      {snapshotId && <p>{included.length > 0 ? included.map((location) => location.name).join(", ") : t("none")}</p>}
    </DetailRow>
  )
}

// Ticks are kept in the dialog until Save, which saves each location whose tick changed.
function EditLocations({ locations, snapshotId }: { locations: LocationSetting[]; snapshotId: string }) {
  const t = useTranslations("inventory.locations")
  const errorMessage = useErrorMessage()
  const [open, setOpen] = useState(false)
  const [ticked, setTicked] = useState(new Set<string>())
  const [error, setError] = useState<string>()
  const [save, saving] = locationsApi.useSaveInventoryLocationMutation()
  const saved = new Set(
    locations.filter((location) => location.classification === "merchant").map((location) => location.locationId)
  )
  const changed = locations.filter((location) => ticked.has(location.locationId) !== saved.has(location.locationId))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    try {
      for (const location of changed) {
        await save({
          locationId: location.locationId,
          classification: ticked.has(location.locationId) ? "merchant" : leftOut(location.kind),
          snapshotId,
          expectedRevision: location.revision
        }).unwrap()
      }
      setOpen(false)
    } catch (saveError) {
      setError(errorMessage(saveError, t("saveFailed")))
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setTicked(saved)
          setError(undefined)
        }
        setOpen(next)
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" className="h-11 shrink-0 sm:h-[34px]" aria-label={t("editLabel")} />}
      >
        {t("edit")}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {/* The store's own locations first, then those run by apps. */}
            {locations
              .toSorted((a, b) => Number(Boolean(a.kind && notes[a.kind])) - Number(Boolean(b.kind && notes[b.kind])))
              .map((location) => (
                <LocationRow
                  key={location.locationId}
                  location={location}
                  checked={ticked.has(location.locationId)}
                  onCheckedChange={(checked) =>
                    setTicked((current) => {
                      const next = new Set(current)
                      if (checked) {
                        next.add(location.locationId)
                      } else {
                        next.delete(location.locationId)
                      }
                      return next
                    })
                  }
                />
              ))}
          </div>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
            <Button type="submit" disabled={saving.isLoading || changed.length === 0}>
              {saving.isLoading ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
