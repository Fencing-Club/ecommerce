"use client"

import type { ShopifyLocationKind } from "@repo/aisle/shopify"
import Link from "next/link"
import { useState } from "react"
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
import { api, errorMessage } from "@/lib/api"
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
  action,
  children
}: {
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="flex items-center gap-2 text-sm font-medium">{title}</h3>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
      {action}
    </div>
  )
}

// Why an app-managed location is usually left out.
const notes: Partial<Record<ShopifyLocationKind, string>> = {
  amazon_fulfillment: "Amazon FBA stock, read from Amazon directly",
  shopify_collective: "A partner’s stock through Shopify Collective",
  fulfillment_service: "Run by an app, such as a third-party warehouse"
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
  const id = `location-${location.locationId.split("/").at(-1)}`
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <FieldContent>
        <FieldLabel htmlFor={id}>{location.name}</FieldLabel>
        {location.kind && notes[location.kind] && <FieldDescription>{notes[location.kind]}</FieldDescription>}
      </FieldContent>
    </Field>
  )
}

// The Shopify locations that count as the buyer's stock, with a dialog to choose them. Locations run by apps start
// unticked, and Amazon's FBA stock comes from Amazon directly.
export function InventoryLocations() {
  const { data, isLoading, isError, error } = locationsApi.useInventoryLocationSettingsQuery()
  const snapshotId = data?.snapshotId
  const included = data?.locations.filter((location) => location.classification === "merchant") ?? []
  return (
    <DetailRow
      title="Inventory locations"
      action={snapshotId && data && <EditLocations locations={data.locations} snapshotId={snapshotId} />}
    >
      {isLoading && (
        <output className="block">
          <Skeleton className="h-5 w-48" />
          <span className="sr-only">Loading locations</span>
        </output>
      )}
      {isError && (
        <p role="alert" className="text-destructive">
          {errorMessage(error, "Locations couldn't be loaded")}
        </p>
      )}
      {data && !snapshotId && (
        <p>
          Sync Shopify on{" "}
          <Link href="/products" className="underline underline-offset-4 hover:text-foreground">
            Products
          </Link>{" "}
          first
        </p>
      )}
      {snapshotId && <p>{included.length > 0 ? included.map((location) => location.name).join(", ") : "None"}</p>}
    </DetailRow>
  )
}

// Ticks are kept in the dialog until Save, which saves each location whose tick changed.
function EditLocations({ locations, snapshotId }: { locations: LocationSetting[]; snapshotId: string }) {
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
      setError(errorMessage(saveError, "Couldn’t save the locations. Try again."))
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
      <DialogTrigger render={<Button variant="outline" size="sm" aria-label="Edit inventory locations" />}>
        Edit
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Inventory locations</DialogTitle>
            <DialogDescription>Stock at the ticked locations counts as yours in Restock.</DialogDescription>
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
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={saving.isLoading || changed.length === 0}>
              {saving.isLoading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
