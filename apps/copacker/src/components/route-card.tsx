import { type Destination, destinationSchema } from "@repo/copacker-orders"
import { Building2, MapPin, Plus, Warehouse, X } from "lucide-react"
import { useState } from "react"
import { useController, useFormContext, useWatch } from "react-hook-form"
import { useTranslations } from "use-intl"
import { PageLink } from "@/components/access"
import { WarningNote } from "@/components/common"
import { RouteStops } from "@/components/route-stops"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { OrderForm } from "@/lib/order-form"

type Option = { value: string; label: string; disabled?: boolean }

// The forwarders' addresses a PO can stop at on the way, and whether Amazon could pick up there.
export type ForwarderAddress = { addressId: string; forwarderId: string; label: string; hasPhone?: boolean }

// The link to add a forwarder's phone number, in a translated sentence.
const forwardersLink = (chunks: React.ReactNode) => (
  <PageLink href="/partners?type=forwarder" className="underline underline-offset-2">
    {chunks}
  </PageLink>
)

// The purchase order editor's route: the supplier, a forwarder's stop on the way if the buyer adds one, and where the
// goods go, with the delivery address for the buyer's own location. A new destination goes to `onDestinationChange`,
// which moves the lines there. Amazon picks up from a stop only with a phone number to call.
export function RouteCard({
  suppliers,
  deliveries,
  forwarderAddresses,
  onDestinationChange
}: {
  suppliers: Array<{ id: string; name: string }>
  deliveries: Array<{ id: string; name: string }>
  forwarderAddresses: ForwarderAddress[]
  onDestinationChange: (destination: Destination) => void
}) {
  const t = useTranslations("orders.builder")
  const { control, setValue } = useFormContext<OrderForm>()
  const destination = useWatch({ control, name: "destination" })
  const via = useWatch({ control, name: "via" })
  const [addingStop, setAddingStop] = useState(false)
  return (
    <Card className="gap-0 py-0">
      <RouteStops
        supplier={
          <RoutePicker
            name="supplierId"
            label={t("supplier")}
            icon={<Building2 />}
            placeholder={t("chooseSupplier")}
            options={suppliers.map((row) => ({ value: row.id, label: row.name }))}
          />
        }
        stop={
          (via || addingStop) && (
            <Stop
              forwarderAddresses={forwarderAddresses}
              onRemove={() => {
                setValue("via", undefined, { shouldDirty: true })
                setAddingStop(false)
              }}
            />
          )
        }
        destination={
          <>
            <RoutePicker
              name="destination"
              label={t("destination")}
              icon={<MapPin />}
              options={destinationSchema.options.map((value) => ({ value, label: t(`destinations.${value}`) }))}
              onValueChange={(value) => {
                const parsed = destinationSchema.safeParse(value)
                if (parsed.success) {
                  onDestinationChange(parsed.data)
                }
              }}
            />
            {destination === "warehouse" && (
              <RoutePicker
                name="deliveryId"
                label={t("deliveryAddress")}
                placeholder={deliveries.length ? t("chooseAddress") : t("addAddressInSettings")}
                options={deliveries.map((row) => ({ value: row.id, label: row.name }))}
              />
            )}
          </>
        }
      >
        {!via && !addingStop && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ms-auto text-muted-foreground"
            disabled={!forwarderAddresses.length}
            onClick={() => setAddingStop(true)}
          >
            <Plus data-icon="inline-start" />
            {t("addStop")}
          </Button>
        )}
      </RouteStops>
      {via &&
        destination === "amazon" &&
        forwarderAddresses.find((row) => row.addressId === via.addressId)?.hasPhone === false && (
          <p className="px-3 pb-3">
            <WarningNote>{t.rich("stopNeedsPhone", { link: forwardersLink })}</WarningNote>
          </p>
        )}
    </Card>
  )
}

// A pill in the route from the supplier to the destination, which opens a menu of choices.
function PillSelect({
  label,
  icon,
  options,
  placeholder,
  value,
  onChange,
  invalid
}: {
  label: string
  icon?: React.ReactNode
  options: Option[]
  placeholder?: string
  value: string | null
  onChange: (value: string | null) => void
  invalid?: boolean
}) {
  return (
    <Select items={options} value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        aria-invalid={invalid}
        size="sm"
        className="max-w-md min-w-0 rounded-full border-transparent bg-muted font-medium hover:bg-muted/70 dark:bg-muted *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate"
      >
        {icon}
        <SelectValue>
          {(chosen: string | null) => options.find((option) => option.value === chosen)?.label ?? placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start" className="w-auto min-w-48">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// A pill for one of the form's route fields. `onValueChange` hears what was chosen once the form has it.
function RoutePicker({
  name,
  onValueChange,
  ...props
}: {
  name: "supplierId" | "destination" | "deliveryId"
  label: string
  icon?: React.ReactNode
  options: Option[]
  placeholder?: string
  onValueChange?: (value: string | undefined) => void
}) {
  const {
    field: { value, onChange },
    fieldState
  } = useController<OrderForm, typeof name>({ name })
  return (
    <PillSelect
      {...props}
      value={typeof value === "string" && value ? value : null}
      onChange={(next) => {
        onChange(next ?? undefined)
        onValueChange?.(next ?? undefined)
      }}
      invalid={fieldState.invalid}
    />
  )
}

// A freight forwarder the goods stop at on the way to the destination.
function Stop({ forwarderAddresses, onRemove }: { forwarderAddresses: ForwarderAddress[]; onRemove: () => void }) {
  const t = useTranslations("orders.builder")
  const { setValue, control } = useFormContext<OrderForm>()
  const via = useWatch({ control, name: "via" })
  return (
    <span className="flex min-w-0 items-center">
      <PillSelect
        label={t("stop")}
        icon={<Warehouse />}
        placeholder={t("chooseForwarder")}
        options={forwarderAddresses.map((row) => ({ value: row.addressId, label: row.label }))}
        value={via?.addressId ?? null}
        onChange={(addressId) => {
          const row = forwarderAddresses.find((address) => address.addressId === addressId)
          setValue("via", row ? { forwarderId: row.forwarderId, addressId: row.addressId } : undefined, {
            shouldDirty: true
          })
        }}
      />
      <Button type="button" variant="ghost" size="icon-xs" aria-label={t("removeStop")} onClick={onRemove}>
        <X />
      </Button>
    </span>
  )
}
