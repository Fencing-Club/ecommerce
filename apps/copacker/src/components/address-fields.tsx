import { useDebouncedValue } from "@mantine/hooks"
import { countriesIn } from "@repo/copacker-shipments/countries"
import { useEffect, useId, useRef, useState } from "react"
import { useController, useFormContext, useWatch } from "react-hook-form"
import { objectEntries } from "ts-extras"
import { useLocale, useTranslations } from "use-intl"
import { Field, FieldError, FieldGroup } from "@/components/ui/field"
import { addressRegions } from "@/lib/address-regions"
import { loadGooglePlaces } from "@/lib/google-places"
import { formatPhone } from "@/lib/phone"
import type { placeAddress } from "@/lib/place-address"
import { createPlaceSearch, type AddressSuggestion } from "@/lib/place-search"
import { FormInput, FormLabel } from "./form-controls"
import { SelectControl } from "./form-select"
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem } from "./ui/combobox"

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

// Google supplies suggestions; the app's combobox handles keyboard navigation and accessible names.
// The ordinary address fields stay available when Google is unavailable, and remain editable after selection.
function AddressLookup({ path }: { path: string }) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const t = useTranslations("common.address")
  const locale = useLocale()
  const { setValue } = useFormContext()
  const search = useRef<Awaited<ReturnType<typeof createPlaceSearch>> | null>(null)
  const revision = useRef(0)
  const [query, setQuery] = useState("")
  const [debounced] = useDebouncedValue(query, 250)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isReady, setReady] = useState(false)
  const [hasError, setError] = useState(false)
  useEffect(() => {
    if (!key) {
      return
    }
    let active = true
    void loadGooglePlaces(key)
      .then(createPlaceSearch)
      .then((lookup) => {
        if (active) {
          search.current = lookup
          setReady(true)
          setError(false)
        }
      })
      .catch(() => {
        if (active) {
          setError(true)
        }
      })
    return () => {
      active = false
    }
  }, [key])
  const label = t("findAddress")
  const apply = (address: ReturnType<typeof placeAddress>) => {
    for (const [name, value] of objectEntries(address)) {
      setValue(`${path}.${name}`, value, { shouldDirty: true, shouldValidate: true })
    }
    // A unit from a previous address must not silently carry over to a new selection.
    setValue(`${path}.addressLine2`, "", { shouldDirty: true })
  }
  useEffect(() => {
    if (!isReady || debounced.trim().length < 3) {
      return
    }
    let isActive = true
    const current = revision.current
    void search
      .current?.(debounced, locale)
      .then((results) => {
        if (isActive && current === revision.current) {
          setSuggestions(results)
          setError(false)
        }
      })
      .catch((error: unknown) => {
        console.warn("Address search failed", error instanceof Error ? error.message : "Unknown provider error")
        if (isActive && current === revision.current) {
          setError(true)
        }
      })
    return () => {
      isActive = false
    }
  }, [isReady, debounced, locale])
  const select = async (suggestion: AddressSuggestion | null) => {
    if (!suggestion) {
      return
    }
    const current = ++revision.current
    try {
      const address = await suggestion.select()
      if (current === revision.current) {
        apply(address)
        setQuery("")
        setSuggestions([])
        setError(false)
      }
    } catch {
      if (current === revision.current) {
        setError(true)
      }
    }
  }
  if (!key) {
    return null
  }
  return (
    <div className="sm:col-span-2">
      <Combobox
        items={suggestions}
        inputValue={query}
        filter={null}
        itemToStringLabel={(item: AddressSuggestion) => item.label}
        onInputValueChange={(value, details) => {
          // Selecting a result also changes Base UI's input. Only typing or clearing cancels its details request.
          if (details.reason !== "input-change" && details.reason !== "input-clear") {
            return
          }
          revision.current++
          setSuggestions([])
          setQuery(value)
        }}
        onValueChange={(value: AddressSuggestion | null) => {
          void select(value)
        }}
      >
        <ComboboxInput aria-label={label} placeholder={label} showTrigger={false} disabled={!isReady} />
        <ComboboxContent>
          <ComboboxList>
            {(item: AddressSuggestion) => (
              <ComboboxItem key={item.id} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
          <p translate="no" className="px-3 py-2 text-xs font-normal whitespace-nowrap text-[#5e5e5e] dark:text-white">
            Google Maps
          </p>
        </ComboboxContent>
      </Combobox>
      {hasError && <output className="text-sm text-muted-foreground">{t("lookupUnavailable")}</output>}
    </div>
  )
}

// The country as a menu of names. The form keeps its two-letter code, such as CN.
function CountrySelect({ name, regionName }: { name: string; regionName: string }) {
  const { setValue } = useFormContext()
  const t = useTranslations("common.address")
  const countries = countriesIn(useLocale())
  const id = useId()
  const {
    field: { ref, value, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  const code = typeof value === "string" ? value.trim().toUpperCase() : ""
  // An address saved before the menu may hold a code the list lacks, such as UK. It shows as saved, and stays in the
  // list after another country is picked: Base UI's Select drops its value when an option leaves the list under it.
  const [saved] = useState(code)
  const unlisted = [...new Set([saved, code])].filter(
    (entry) => entry && !countries.some((country) => country.value === entry)
  )
  const options = [...unlisted.map((entry) => ({ value: entry, label: entry })), ...countries]
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
        onValueChange={(next) => {
          if (next !== code) {
            setValue(regionName, "", { shouldDirty: true })
          }
          onChange(next ?? "")
        }}
        onBlur={onBlur}
      />
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

function RegionSelect({ name, country }: { name: string; country: string }) {
  const t = useTranslations("common.address")
  const regions = addressRegions(country, useLocale())
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur },
    fieldState
  } = useController({ name })
  const value = typeof fieldValue === "string" ? fieldValue : ""
  const match = regions.find((region) => region.aliases.some((alias) => alias.toLowerCase() === value.toLowerCase()))
  // Preserve saved and Google-provided values that don't match the postal dataset.
  const options = value && !match ? [{ value, label: value }, ...regions] : regions
  if (!regions.length) {
    return <FormInput name={name} label={t("stateOrProvince")} required autoComplete="address-level1" />
  }
  return (
    <Field data-invalid={fieldState.invalid}>
      <FormLabel htmlFor={id} label={t("stateOrProvince")} required />
      <SelectControl
        id={id}
        ref={ref}
        name={name}
        options={options}
        placeholder={t("stateOrProvince")}
        required
        invalid={fieldState.invalid}
        value={match?.value ?? value}
        onValueChange={(next) => onChange(next ?? "")}
        onBlur={onBlur}
        autoComplete="address-level1"
      />
      <FieldError id={`${id}-error`} errors={[fieldState.error]} />
    </Field>
  )
}

// Binds to an address object at `path` in the surrounding form, such as "address" or "origin": the contact, then the
// address, in two columns from small screens up with the street lines across both.
export function AddressFields({ path, requirePhone = false }: { path: string; requirePhone?: boolean }) {
  const t = useTranslations("common.address")
  const country: unknown = useWatch({ name: `${path}.countryCode` })
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
        normalizeOnBlur={(value) => formatPhone(value, typeof country === "string" ? country : undefined)}
      />
      <FormInput name={`${path}.email`} label={t("email")} type="email" autoComplete="email" />
      <AddressLookup path={path} />
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
      <RegionSelect name={`${path}.stateOrRegion`} country={typeof country === "string" ? country : ""} />
      <FormInput name={`${path}.postalCode`} label={t("postalCode")} required autoComplete="postal-code" />
      <CountrySelect name={`${path}.countryCode`} regionName={`${path}.stateOrRegion`} />
    </FieldGroup>
  )
}
