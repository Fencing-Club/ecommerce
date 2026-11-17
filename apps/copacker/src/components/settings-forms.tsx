import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@buildkitgg/shadcn"
import { useSyncExternalStore } from "react"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { useActionForm } from "@/hooks/use-action-form"
import type { Locale } from "@/i18n/locales"
import { localeNames, locales } from "@/i18n/locales"
import { contactDetailsSchema } from "@/lib/contact-details"
import { timeZoneLabel } from "@/lib/time-zone"
import { dayRange } from "@/server/restock-report"
import { ActionForm } from "./action-form"
import { FormField, FormInput, FormNumber, useFormField } from "./form-controls"
import { FormSelect } from "./form-select"

// Each settings form is a card whose Save waits for a change (ActionForm's "card" layout).

// The supplier's contact details, which their buyers see. All optional.
export function SupplierProfileForm(profile: z.input<typeof contactDetailsSchema>) {
  const t = useTranslations("settings.supplierProfile")
  const { form, submit } = useActionForm({
    schema: contactDetailsSchema,
    action: "supplier.profile",
    defaultValues: profile,
    // The fields show what was saved: the website with its https://.
    keepSaved: (saved) => saved
  })
  return (
    <ActionForm form={form} onSubmit={submit} layout="card" requireChange>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput name="contactName" label={t("contactName")} autoComplete="name" />
        <FormInput name="contactEmail" label={t("contactEmail")} type="email" autoComplete="email" />
        <FormInput name="phoneNumber" label={t("phone")} type="tel" autoComplete="tel" />
        <FormInput
          name="website"
          label={t("website")}
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="example.com"
        />
      </div>
    </ActionForm>
  )
}

// The browser's time zone doesn't change while the page is open, so there's nothing to subscribe to.
const noSubscription = () => () => undefined
// An empty field asks for the days; the checks after it keep their own messages, such as "Enter 730 or less", which a
// plain `error` here would replace.
const days = z
  .number({ error: (issue) => (issue.code === "invalid_type" ? "settings.restock.enterDays" : undefined) })
  .int()
  .min(dayRange.min)
  .max(dayRange.max)
const restockSchema = z.object({ salesDays: days, leadTimeDays: days })

// The sales period and default lead time Restock starts from and the Overview uses.
export function RestockSettingsForm(values: z.input<typeof restockSchema>) {
  const t = useTranslations("settings.restock")
  const { form, submit } = useActionForm({
    schema: restockSchema,
    action: "workspace.restock",
    defaultValues: values,
    keepSaved: true
  })
  return (
    <ActionForm form={form} onSubmit={submit} layout="card" requireChange>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormNumber
          name="salesDays"
          required
          label={t("salesPeriodDays")}
          min={dayRange.min}
          max={dayRange.max}
          step={1}
        />
        <FormNumber
          name="leadTimeDays"
          required
          label={t("leadTimeDays")}
          description={t("leadTimeDescription")}
          min={dayRange.min}
          max={dayRange.max}
          step={1}
        />
      </div>
    </ActionForm>
  )
}

// The choice that follows the computer's language, which is saved as an empty value.
const systemLanguage = "system"

const languageSchema = z.object({ locale: z.union([z.literal(systemLanguage), z.enum(locales)]) })

// The person's own language, in every workspace: the computer's, or one chosen here. Saving re-renders the page in it.
export function LanguageForm({ locale, systemLocale }: { locale: Locale | null; systemLocale: Locale }) {
  const t = useTranslations("settings.language")
  const { form, submit } = useActionForm({
    schema: languageSchema,
    action: "profile.locale",
    defaultValues: { locale: locale ?? systemLanguage },
    toPayload: (values) => ({ locale: values.locale === systemLanguage ? "" : values.locale }),
    keepSaved: true
  })
  return (
    <ActionForm form={form} onSubmit={submit} layout="card" requireChange>
      <FormSelect
        name="locale"
        label={t("label")}
        options={[
          { value: systemLanguage, label: t("system", { language: localeNames[systemLocale] }) },
          ...locales.map((value) => ({ value, label: localeNames[value] }))
        ]}
      />
    </ActionForm>
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
  const t = useTranslations("settings.timeZone")
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
    <ActionForm form={form} onSubmit={submit} layout="card" requireChange>
      <TimeZoneField name="timeZone" label={t("label")} zones={zones} computerZone={timeZoneLabel(browserZone)} />
    </ActionForm>
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
  const t = useTranslations("settings.timeZone")
  const {
    field: { ref, value: fieldValue, onChange, onBlur },
    fieldProps,
    controlProps
  } = useFormField(name)
  const value = typeof fieldValue === "string" && fieldValue ? fieldValue : automatic
  // A zone saved under another name, such as an alias, stays one of the choices.
  const listed = value === automatic || zones.some((zone) => zone.value === value)
  const choices = listed ? zones : [{ value, label: timeZoneLabel(value) }, ...zones]
  const { loose, regions } = zoneGroups(choices)
  const labels = new Map([
    [automatic, t("automaticZone", { zone: computerZone })],
    ...choices.map((zone): [string, string] => [zone.value, zone.label])
  ])
  return (
    <FormField {...fieldProps} label={label}>
      <Select value={value} onValueChange={(next: string | null) => onChange(!next || next === automatic ? "" : next)}>
        <SelectTrigger {...controlProps} ref={ref} onBlur={onBlur} className="w-full">
          <SelectValue>{(chosen: string | null) => (chosen && labels.get(chosen)) ?? chosen}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="max-h-[min(20rem,var(--available-height))]">
          <SelectGroup>
            <SelectItem value={automatic} label={t("automatic")}>
              {t("automatic")}
              <span className="ms-auto text-muted-foreground">{computerZone}</span>
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
                  <span className="ms-auto text-muted-foreground tabular-nums">{zone.offset}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  )
}
