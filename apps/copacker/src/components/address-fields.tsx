"use client"

import { FieldGroup } from "@/components/ui/field"
import { FormInput } from "./form-controls"

const addressFields = [
  { key: "name", label: "Contact name" },
  { key: "phoneNumber", label: "Phone number", type: "tel", autoComplete: "tel" },
  { key: "email", label: "Email", type: "email", optional: true, autoComplete: "email" },
  { key: "addressLine1", label: "Street address", autoComplete: "address-line1" },
  { key: "addressLine2", label: "Address line 2", optional: true, autoComplete: "address-line2" },
  { key: "city", label: "City", autoComplete: "address-level2" },
  { key: "stateOrRegion", label: "State or province", autoComplete: "address-level1" },
  { key: "postalCode", label: "Postal code", autoComplete: "postal-code" },
  { key: "countryCode", label: "Country code", placeholder: "CN", autoComplete: "country" }
]

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

// Binds to an address object at `path` in the surrounding form, such as "address" or "origin".
export function AddressFields({ path, requirePhone = false }: { path: string; requirePhone?: boolean }) {
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      {addressFields.map((field) => {
        const optional = field.optional || (field.key === "phoneNumber" && !requirePhone)
        return (
          <FormInput
            key={field.key}
            name={`${path}.${field.key}`}
            label={optional ? `${field.label} (optional)` : field.label}
            type={field.type ?? "text"}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
          />
        )
      })}
    </FieldGroup>
  )
}
