import { MapPin, Plus } from "lucide-react"
import { useId, useState } from "react"
import { useTranslations } from "use-intl"
import { Field } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormLabel } from "./form-controls"
import type { PartnerAddress } from "./partner-address"

const addAddress = "add-address"

export function PickupAddressSelect({
  addresses,
  value,
  onChange,
  onAdd
}: {
  addresses: PartnerAddress[]
  value: string
  onChange: (id: string) => void
  onAdd: () => void
}) {
  const t = useTranslations("orders.packing")
  const id = useId()
  const [open, setOpen] = useState(false)
  const selected = addresses.find((address) => address.id === value)
  const details = (location: PartnerAddress) => (
    <span className="flex min-w-0 flex-col gap-1 text-start whitespace-normal">
      <span className="font-medium">{location.name}</span>
      <span className="text-xs leading-relaxed text-muted-foreground">
        {[
          location.address.addressLine1,
          location.address.addressLine2,
          location.address.city,
          location.address.stateOrRegion,
          location.address.postalCode,
          location.address.countryCode
        ]
          .filter(Boolean)
          .join(", ")}
      </span>
    </span>
  )
  return (
    <Field>
      <FormLabel htmlFor={id} label={t("shipFrom")} required />
      <Select
        value={selected?.id ?? null}
        open={open}
        onOpenChange={setOpen}
        items={[
          ...addresses.map((address) => ({ value: address.id, label: address.name })),
          { value: addAddress, label: t("addNewAddress") }
        ]}
        onValueChange={(next) => {
          if (next === addAddress) {
            setOpen(false)
            onAdd()
          } else if (next) {
            onChange(next)
          }
        }}
      >
        <SelectTrigger id={id} className="w-full items-start py-3 data-[size=default]:h-auto [&>svg]:mt-1">
          <SelectValue className="min-w-0 !line-clamp-none">
            {selected ? details(selected) : <span className="text-muted-foreground">{t("chooseAddress")}</span>}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start" className="p-1">
          {addresses.map((address) => (
            <SelectItem
              key={address.id}
              value={address.id}
              className="items-start px-3 py-3 [&>span:first-child]:min-w-0 [&>span:first-child]:shrink"
            >
              <MapPin aria-hidden className="mt-0.5 text-muted-foreground" />
              {details(address)}
            </SelectItem>
          ))}
          {addresses.length > 0 && <SelectSeparator />}
          <SelectItem value={addAddress} className="px-3 py-3">
            <Plus aria-hidden />
            {t("addNewAddress")}
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
  )
}
