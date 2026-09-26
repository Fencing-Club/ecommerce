"use client"

import type { ShopifyLocationKind } from "@repo/aisle/shopify"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { api, errorMessage } from "@/lib/api"
import type { LocationClassification } from "@/server/inventory-locations"
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

function LocationRow({ location, snapshotId }: { location: LocationSetting; snapshotId: string }) {
  const [save, saving] = locationsApi.useSaveInventoryLocationMutation()
  const id = `location-${location.locationId.split("/").at(-1)}`
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={location.classification === "merchant"}
        disabled={saving.isLoading}
        onCheckedChange={(checked) =>
          void save({
            locationId: location.locationId,
            classification: checked ? "merchant" : leftOut(location.kind),
            snapshotId,
            expectedRevision: location.revision
          })
        }
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{location.name}</FieldLabel>
        {location.kind && notes[location.kind] && <FieldDescription>{notes[location.kind]}</FieldDescription>}
        {saving.isError && <p role="alert">{errorMessage(saving.error, "Couldn't save this location. Try again.")}</p>}
      </FieldContent>
    </Field>
  )
}

// Chooses which Shopify locations count as the buyer's stock. Locations run by apps start unticked, and Amazon's FBA
// stock comes from Amazon directly.
export function InventoryLocations() {
  const { data, isLoading, isError, error } = locationsApi.useInventoryLocationSettingsQuery()
  const snapshotId = data?.snapshotId
  return (
    <fieldset className={styles.locations}>
      <legend className={styles.legend}>Locations to include in inventory</legend>
      {isLoading && <p className={styles.detail}>Loading locations…</p>}
      {isError && <p role="alert">{errorMessage(error, "Locations couldn't be loaded.")}</p>}
      {data && !snapshotId && <p className={styles.detail}>Sync Shopify on the Products page to see its locations.</p>}
      {snapshotId &&
        data?.locations
          .toSorted((a, b) => Number(b.classification === "merchant") - Number(a.classification === "merchant"))
          .map((location) => <LocationRow key={location.locationId} location={location} snapshotId={snapshotId} />)}
    </fieldset>
  )
}
