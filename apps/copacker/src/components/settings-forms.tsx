"use client"

import { type Address, addressSchema } from "@repo/aisle"
import { Check } from "lucide-react"
import { useId, useSyncExternalStore } from "react"
import {
  type FieldValues,
  FormProvider,
  type UseFormReturn,
  useController,
  useFormState,
  useWatch
} from "react-hook-form"
import { z } from "zod"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { useActionForm } from "@/hooks/useActionForm"
import { contactDetailsSchema } from "@/lib/contact-details"
import { type ContactKind, contactKindLabels, contactKinds, contactKindsFor } from "@/lib/contacts"
import { websiteSchema } from "@/lib/onboarding"
import { timeZoneLabel } from "@/lib/time-zone"
import { dayRange } from "@/server/restock-report"
import { ActionForm, FormError, SubmitButton } from "./actions"
import { AddressFields, emptyAddress } from "./address-fields"
import { FormInput, FormNumber, FormSelect } from "./form-controls"

type FormLayoutProps<Values extends FieldValues> = {
  form: UseFormReturn<Values, unknown, FieldValues>
  onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>
  children: React.ReactNode
}

// A settings form as a card: its fields, then Save at the right of the card's footer. Save stays outlined and
// disabled until something changes, so a page of these cards doesn't read as a column of orange buttons. The form
// state is read here rather than passed in, so the footer follows edits however the parent is memoized.
export function SettingsForm<Values extends FieldValues>({ form, onSubmit, children }: FormLayoutProps<Values>) {
  const { isDirty, isSubmitting, isSubmitSuccessful, errors } = useFormState({ control: form.control })
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate>
        <Card>
          <CardContent>
            <FieldGroup>
              {children}
              <FormError message={errors.root?.server?.message} />
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end gap-3">
            {isSubmitSuccessful && !isDirty && (
              <output className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3.5" aria-hidden />
                Saved
              </output>
            )}
            <SubmitButton
              type="submit"
              variant={isDirty ? "default" : "outline"}
              pending={isSubmitting}
              disabled={!isDirty}
            >
              Save
            </SubmitButton>
          </CardFooter>
        </Card>
      </form>
    </FormProvider>
  )
}

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email().max(254), z.literal("")])
})

export function SupplierForm({ onSuccess }: { onSuccess?: () => void }) {
  const { form, submit } = useActionForm({
    schema: supplierSchema,
    action: "supplier.create",
    defaultValues: { name: "", email: "" },
    onSuccess
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Add supplier" dialog>
      <FormInput name="name" required label="Supplier company" placeholder="Ok Fencing" autoComplete="off" />
      <FormInput
        name="email"
        label="Email"
        type="email"
        placeholder="supplier@example.com"
        autoComplete="off"
        description="Add one to invite them now."
      />
    </ActionForm>
  )
}

// The supplier's contact details, which their buyers see. All optional.
export function SupplierProfileForm(profile: z.input<typeof contactDetailsSchema>) {
  const { form, submit } = useActionForm({
    schema: contactDetailsSchema,
    action: "supplier.profile",
    defaultValues: profile,
    keepSaved: true,
    // The website shows as saved, with its https://.
    onSuccess: () =>
      form.resetField("website", { defaultValue: websiteSchema.safeParse(form.getValues("website")).data })
  })
  return (
    <SettingsForm form={form} onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput name="contactName" label="Contact name" autoComplete="name" />
        <FormInput name="contactEmail" label="Contact email" type="email" autoComplete="email" />
        <FormInput name="phoneNumber" label="Phone" type="tel" autoComplete="tel" />
        <FormInput
          name="website"
          label="Website"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="example.com"
        />
      </div>
    </SettingsForm>
  )
}

// The browser's time zone doesn't change while the page is open, so there's nothing to subscribe to.
const noSubscription = () => () => undefined
const restockSchema = z.object({
  salesDays: z.number({ error: "Enter the days" }).int().min(dayRange.min).max(dayRange.max),
  leadTimeDays: z.number({ error: "Enter the days" }).int().min(dayRange.min).max(dayRange.max)
})

// The sales period and default lead time Restock starts from and the Overview uses.
export function RestockSettingsForm(values: z.input<typeof restockSchema>) {
  const { form, submit } = useActionForm({
    schema: restockSchema,
    action: "workspace.restock",
    defaultValues: values,
    keepSaved: true
  })
  return (
    <SettingsForm form={form} onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormNumber
          name="salesDays"
          required
          label="Sales period (days)"
          min={dayRange.min}
          max={dayRange.max}
          step={1}
        />
        <FormNumber
          name="leadTimeDays"
          required
          label="Lead time (days)"
          description="For suppliers without their own"
          min={dayRange.min}
          max={dayRange.max}
          step={1}
        />
      </div>
    </SettingsForm>
  )
}

const timeZoneSchema = z.object({ timeZone: z.string() })

// The store's time zone: the Overview counts days and months in it. Left empty, it follows each viewer's computer.
export function TimeZoneForm({
  timeZone,
  computerZone,
  zones
}: {
  timeZone: string | null
  // The computer's zone as last reported to the server, shown until the browser's own is read.
  computerZone: string
  // Every zone with its label, such as "America/Los Angeles (UTC−07:00)".
  zones: Zone[]
}) {
  const { form, submit } = useActionForm({
    schema: timeZoneSchema,
    action: "workspace.timeZone",
    defaultValues: { timeZone: timeZone ?? "" },
    keepSaved: true
  })
  // The computer's zone, named in the automatic choice.
  const browserZone = useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => computerZone
  )
  return (
    <SettingsForm form={form} onSubmit={submit}>
      <TimeZoneField name="timeZone" label="Store time zone" zones={zones} computerZone={timeZoneLabel(browserZone)} />
    </SettingsForm>
  )
}

type Zone = { value: string; label: string }

// The choice that follows each viewer's computer, which is saved as an empty value.
const automatic = "automatic"

// Zones without a region, such as UTC, first; then each region's zones by city, with the offset from the label:
// America/Argentina/Buenos_Aires is "Buenos Aires, Argentina" under America.
function zoneGroups(zones: Zone[]) {
  const loose: Zone[] = []
  const regions = new Map<string, { value: string; city: string; offset: string }[]>()
  for (const zone of zones) {
    const [region, ...place] = zone.value.split("/")
    if (!region || place.length === 0) {
      loose.push(zone)
      continue
    }
    const list = regions.get(region) ?? []
    list.push({
      value: zone.value,
      city: place.toReversed().join(", ").replaceAll("_", " "),
      offset: /\(([^)]+)\)$/.exec(zone.label)?.[1] ?? ""
    })
    regions.set(region, list)
  }
  return {
    loose,
    regions: [...regions]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([region, list]) => ({ region, zones: list.toSorted((a, b) => a.city.localeCompare(b.city)) }))
  }
}

// A long list, so it opens as a scrolling menu under the field rather than over it. Typing a city's first letters
// jumps to it.
function TimeZoneField({
  name,
  label,
  zones,
  computerZone
}: {
  name: string
  label: string
  zones: Zone[]
  // The viewer's computer's zone, as its label.
  computerZone: string
}) {
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur },
    fieldState
  } = useController({ name })
  const value = typeof fieldValue === "string" && fieldValue ? fieldValue : automatic
  // A zone saved under another name, such as an alias, stays one of the choices.
  const listed = value === automatic || zones.some((zone) => zone.value === value)
  const choices = listed ? zones : [{ value, label: timeZoneLabel(value) }, ...zones]
  const { loose, regions } = zoneGroups(choices)
  const labels = new Map([
    [automatic, `Automatic, ${computerZone}`],
    ...choices.map((zone): [string, string] => [zone.value, zone.label])
  ])
  return (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={(next: string | null) => onChange(!next || next === automatic ? "" : next)}>
        <SelectTrigger id={id} ref={ref} onBlur={onBlur} aria-invalid={fieldState.invalid} className="w-full">
          <SelectValue>{(chosen: string | null) => (chosen && labels.get(chosen)) ?? chosen}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="max-h-[min(20rem,var(--available-height))]">
          <SelectGroup>
            <SelectItem value={automatic} label="Automatic">
              Automatic
              <span className="ml-auto text-muted-foreground">{computerZone}</span>
            </SelectItem>
            {loose.map((zone) => (
              <SelectItem key={zone.value} value={zone.value}>
                {zone.label}
              </SelectItem>
            ))}
          </SelectGroup>
          {regions.map((group) => (
            <SelectGroup key={group.region}>
              <SelectSeparator />
              <SelectLabel>{group.region}</SelectLabel>
              {group.zones.map((zone) => (
                <SelectItem key={zone.value} value={zone.value} label={zone.city}>
                  {zone.city}
                  <span className="ml-auto text-muted-foreground tabular-nums">{zone.offset}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(contactKinds),
  address: addressSchema,
  // Empty when a delivery address isn't linked to a Shopify location.
  shopifyLocationId: z.string()
})

type SavedContact = {
  id: string
  name: string
  kind: ContactKind
  address: Address
  shopifyLocationId: string | null
}

export function ContactForm({
  contact,
  onSuccess,
  supplier = false,
  locations = []
}: {
  contact?: SavedContact
  onSuccess?: () => void
  supplier?: boolean
  locations?: { id: string; name: string }[]
}) {
  const { form, submit } = useActionForm({
    schema: contactSchema,
    action: contact ? "contact.update" : "contact.create",
    defaultValues: contact
      ? {
          name: contact.name,
          kind: contact.kind,
          address: { ...emptyAddress, ...contact.address },
          shopifyLocationId: contact.shopifyLocationId ?? ""
        }
      : { name: "", kind: supplier ? "pickup" : "delivery", address: emptyAddress, shopifyLocationId: "" },
    toPayload: (values) => ({
      ...(contact && { id: contact.id }),
      ...values,
      shopifyLocationId: values.shopifyLocationId || null
    }),
    onSuccess
  })
  const kind = useWatch({ control: form.control, name: "kind" })
  const kinds = supplier ? [] : contactKindsFor("buyer")
  return (
    <ActionForm form={form} onSubmit={submit} label={contact ? "Save changes" : "Save address"} dialog>
      <div className={kinds.length > 1 ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
        <FormInput name="name" required label="Address name" placeholder="Shenzhen warehouse" autoComplete="off" />
        {kinds.length > 1 && (
          <FormSelect
            name="kind"
            required
            label="Address type"
            options={kinds.map((option) => ({ value: option, label: contactKindLabels[option] }))}
          />
        )}
      </div>
      {!supplier && kind === "delivery" && locations.length > 0 && (
        <FormSelect
          name="shopifyLocationId"
          label="Shopify location"
          description="Purchase orders sent here show as on order there"
          placeholder="Not linked"
          options={locations.map((location) => ({ value: location.id, label: location.name }))}
        />
      )}
      <AddressFields path="address" />
    </ActionForm>
  )
}
