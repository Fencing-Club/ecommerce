"use client"

import type { ShopifyLocationKind } from "@repo/aisle/shopify"
import { Pencil } from "lucide-react"
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
import { api, errorMessage } from "@/lib/api"
import type { LocationClassification } from "@/server/inventory-locations"
import { FormError } from "./actions"
import * as styles from "./inventory-locations.css"

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

// Why an app-managed location is usually left out.
const notes: Partial<Record<ShopifyLocationKind, string>> = {
  amazon_fulfillment: "Mirrors Amazon FBA, which Copacker reads from Amazon directly.",
  shopify_collective: "A partner's stock shared through Shopify Collective.",
  fulfillment_service: "Managed by an app, such as a third-party warehouse."
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
    <section className={styles.section}>
      <div className={styles.heading}>
        <h3 className={styles.title}>Inventory locations</h3>
        {snapshotId && data && <EditLocations locations={data.locations} snapshotId={snapshotId} />}
      </div>
      {isLoading && <p className={styles.detail}>Loading locations…</p>}
      {isError && <p role="alert">{errorMessage(error, "Locations couldn't be loaded.")}</p>}
      {data && !snapshotId && <p className={styles.detail}>Sync Shopify on the Products page to see its locations.</p>}
      {snapshotId &&
        (included.length > 0 ? (
          <ul className={styles.list}>
            {included.map((location) => (
              <li key={location.locationId}>{location.name}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.detail}>No locations counted. Restock sees no Shopify stock.</p>
        ))}
    </section>
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
        <Pencil data-icon="inline-start" />
        Edit
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className={styles.form}>
          <DialogHeader>
            <DialogTitle>Inventory locations</DialogTitle>
            <DialogDescription>Stock at the ticked locations counts as yours in restock.</DialogDescription>
          </DialogHeader>
          <div className={styles.locations}>
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
