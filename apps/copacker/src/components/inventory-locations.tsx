"use client"

import { MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { api, errorMessage } from "@/lib/api"
import type { LocationClassification } from "@/server/inventory-locations"
import * as styles from "./inventory-products.css"

type LocationSetting = {
  locationId: string
  name: string
  classification: LocationClassification
  automatic: LocationClassification
  saved: boolean
  revision: number
}
type LocationSettings = { snapshotId: string | null; locations: LocationSetting[] }

const locationsApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    inventoryLocationSettings: build.query<LocationSettings, void>({
      query: () => "inventory/locations",
      keepUnusedDataFor: 0
    }),
    saveInventoryLocation: build.mutation<
      unknown,
      { locationId: string; classification: LocationClassification; snapshotId: string; expectedRevision: number }
    >({
      query: (body) => ({ url: "inventory/locations", method: "PATCH", body })
    })
  })
})

export const classificationLabels: Record<LocationClassification, { label: string; description: string }> = {
  merchant: { label: "Your stock", description: "Counts as your inventory and local sales." },
  amazon_mirror: { label: "Amazon mirror", description: "Shows Amazon's stock. POs to Amazon arrive here." },
  unresolved: { label: "Needs review", description: "Shown, but not counted until you choose." },
  excluded: { label: "Excluded", description: "Hidden from inventory, such as a partner's stock." }
}

const order = Object.keys(classificationLabels)
// The store's own locations first, then Amazon, those needing review, and excluded ones.
const byClassification = (a: LocationSetting, b: LocationSetting) =>
  order.indexOf(a.classification) - order.indexOf(b.classification) || a.name.localeCompare(b.name)

const isClassification = (value: string): value is LocationClassification => Object.hasOwn(classificationLabels, value)

function LocationRow({
  location,
  snapshotId,
  onSaved
}: {
  location: LocationSetting
  snapshotId: string
  onSaved: () => void
}) {
  const [save, saving] = locationsApi.useSaveInventoryLocationMutation()
  const id = `location-${location.locationId.split("/").at(-1)}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{location.name}</FieldLabel>
      <NativeSelect
        id={id}
        className={styles.fullWidth}
        value={location.classification}
        disabled={saving.isLoading}
        onChange={async (event) => {
          const classification = event.target.value
          if (!isClassification(classification)) {
            return
          }
          try {
            await save({
              locationId: location.locationId,
              classification,
              snapshotId,
              expectedRevision: location.revision
            }).unwrap()
            onSaved()
          } catch {
            // The mutation keeps the error for the message below.
          }
        }}
      >
        {Object.entries(classificationLabels).map(([value, { label }]) => (
          <NativeSelectOption key={value} value={value}>
            {value === location.automatic ? `${label} (automatic)` : label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldDescription>
        {classificationLabels[location.classification].description}
        {location.saved && location.classification !== location.automatic && " Set by you."}
      </FieldDescription>
      {saving.isError && <p role="alert">{errorMessage(saving.error, "Couldn't save this location. Try again.")}</p>}
    </Field>
  )
}

// Lets the buyer confirm or change how each Shopify location counts. Automatic choices come from the app that manages
// the location, so most stores need no changes.
export function InventoryLocations({ onChange }: { onChange: () => void }) {
  const { data, isLoading, isError, error, refetch } = locationsApi.useInventoryLocationSettingsQuery()
  const snapshotId = data?.snapshotId
  const needsReview = data?.locations.filter((location) => location.classification === "unresolved").length ?? 0
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <MapPin data-icon="inline-start" />
        Manage locations
        {needsReview > 0 && <Badge variant="secondary">{needsReview} to review</Badge>}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Inventory locations</SheetTitle>
          <SheetDescription>
            Choose how each Shopify location counts toward your inventory, sales, and POs.
          </SheetDescription>
        </SheetHeader>
        <div className={styles.locationSettings}>
          {isLoading && <p className={styles.summary}>Loading locations…</p>}
          {isError && <p role="alert">{errorMessage(error, "Locations couldn't be loaded.")}</p>}
          {data && !snapshotId && <p className={styles.summary}>Sync Shopify to see its locations.</p>}
          {snapshotId &&
            data?.locations.toSorted(byClassification).map((location) => (
              <LocationRow
                key={location.locationId}
                location={location}
                snapshotId={snapshotId}
                onSaved={() => {
                  void refetch()
                  onChange()
                }}
              />
            ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
