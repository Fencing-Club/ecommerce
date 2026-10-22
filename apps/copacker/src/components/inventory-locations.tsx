import type { ShopifyLocationKind } from "@repo/copacker-marketplaces/shopify"
import { Link } from "@tanstack/react-router"
import { MapPin } from "lucide-react"
import { useController } from "react-hook-form"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { useErrorMessage } from "@/hooks/use-error-text"
import { api } from "@/lib/api"
import type { LocationClassification } from "@/server/inventory-locations"
import { FormDialog } from "./form-dialog"

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
    <Link to="/products" className="text-link hover:text-foreground">
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

// The ticked locations' ids, in the order the dialog lists every location, so ticking one off and on again is no change.
const locationsSchema = z.object({ included: z.array(z.string()) })

// Ticks are kept in the dialog until Save, which saves each location whose tick changed.
function EditLocations({ locations, snapshotId }: { locations: LocationSetting[]; snapshotId: string }) {
  const t = useTranslations("inventory.locations")
  const [saveLocation] = locationsApi.useSaveInventoryLocationMutation()
  // The store's own locations first, then those run by apps.
  const listed = locations.toSorted(
    (a, b) => Number(Boolean(a.kind && notes[a.kind])) - Number(Boolean(b.kind && notes[b.kind]))
  )
  const saved = listed
    .filter((location) => location.classification === "merchant")
    .map((location) => location.locationId)
  return (
    <FormDialog
      trigger={
        <DialogTrigger
          render={<Button variant="outline" size="responsive" className="shrink-0" aria-label={t("editLabel")} />}
        >
          {t("edit")}
        </DialogTrigger>
      }
      title={t("title")}
      description={t("description")}
      submitLabel={t("save")}
      requireChange
      form={{
        schema: locationsSchema,
        defaultValues: { included: saved },
        // Each changed location saves through its own endpoint, whose cache tags refresh the settings and restock.
        run: async (_, { included }) => {
          for (const location of locations) {
            const ticked = included.includes(location.locationId)
            if (ticked !== saved.includes(location.locationId)) {
              await saveLocation({
                locationId: location.locationId,
                classification: ticked ? "merchant" : leftOut(location.kind),
                snapshotId,
                expectedRevision: location.revision
              }).unwrap()
            }
          }
        },
        fallback: t("saveFailed")
      }}
    >
      <LocationChoices locations={listed} />
    </FormDialog>
  )
}

function LocationChoices({ locations }: { locations: LocationSetting[] }) {
  const {
    field: { value, onChange }
  } = useController<z.input<typeof locationsSchema>, "included">({ name: "included" })
  return (
    <div className="flex flex-col gap-3">
      {locations.map((location) => (
        <LocationRow
          key={location.locationId}
          location={location}
          checked={value.includes(location.locationId)}
          onCheckedChange={(checked) =>
            onChange(
              locations
                .map((entry) => entry.locationId)
                .filter((id) => (id === location.locationId ? checked : value.includes(id)))
            )
          }
        />
      ))}
    </div>
  )
}
