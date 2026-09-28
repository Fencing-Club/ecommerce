"use client"

import { useLocale, useTranslations } from "next-intl"
import { useId } from "react"
import { useController } from "react-hook-form"
import { Field, FieldError, FieldGroup } from "@/components/ui/field"
import { countriesIn } from "@/lib/countries"
import { FormInput, FormLabel, SelectControl } from "./form-controls"

export const emptyAddress = {
  name: "",
  phoneNumber: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  stateOrRegion: "",
  postalCode: "",
  countryCode: ""
}

// The country as a menu of names. The form keeps its two-letter code, such as CN.
function CountrySelect({ name }: { name: string }) {
  const t = useTranslations("common.address")
  const countries = countriesIn(useLocale())
  const id = useId()
  const {
    field: { ref, value, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  const code = typeof value === "string" ? value.trim().toUpperCase() : ""
  // An address saved before the menu may hold a code the list lacks, such as UK. It shows as saved until changed.
  const options =
    code && !countries.some((country) => country.value === code)
      ? [{ value: code, label: code }, ...countries]
      : countries
  return (
    <Field data-invalid={fieldState.invalid}>
      <FormLabel htmlFor={id} label={t("country")} required />
      <SelectControl
        id={id}
        ref={ref}
        name={fieldName}
        autoComplete="country"
        options={options}
        placeholder={t("chooseCountry")}
        required
        invalid={fieldState.invalid}
        value={code}
        onValueChange={(next) => onChange(next ?? "")}
        onBlur={onBlur}
      />
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

// Binds to an address object at `path` in the surrounding form, such as "address" or "origin": the contact, then the
// address, in two columns from small screens up with the street lines across both.
export function AddressFields({ path, requirePhone = false }: { path: string; requirePhone?: boolean }) {
  const t = useTranslations("common.address")
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      <FormInput
        name={`${path}.name`}
        label={t("contactName")}
        required
        autoComplete="name"
        className="sm:col-span-2"
      />
      <FormInput
        name={`${path}.phoneNumber`}
        label={t("phoneNumber")}
        type="tel"
        required={requirePhone}
        autoComplete="tel"
      />
      <FormInput name={`${path}.email`} label={t("email")} type="email" autoComplete="email" />
      <FormInput
        name={`${path}.addressLine1`}
        label={t("streetAddress")}
        required
        autoComplete="address-line1"
        className="sm:col-span-2"
      />
      <FormInput
        name={`${path}.addressLine2`}
        label={t("addressLine2")}
        autoComplete="address-line2"
        className="sm:col-span-2"
      />
      <FormInput name={`${path}.city`} label={t("city")} required autoComplete="address-level2" />
      <FormInput name={`${path}.stateOrRegion`} label={t("stateOrProvince")} required autoComplete="address-level1" />
      <FormInput name={`${path}.postalCode`} label={t("postalCode")} required autoComplete="postal-code" />
      <CountrySelect name={`${path}.countryCode`} />
    </FieldGroup>
  )
}
