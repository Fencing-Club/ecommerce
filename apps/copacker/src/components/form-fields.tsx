"use client"

import { Field, FieldDescription } from "@/components/ui/field"
import { FormLabel } from "./form-controls"
import { SelectControl } from "./form-select"

// A select for a plain form, outside React Hook Form.
export function SelectField({
  label,
  id,
  name,
  options,
  placeholder,
  description,
  required,
  disabled,
  value,
  defaultValue,
  onChange
}: {
  label: string
  id: string
  // Submits the value with the form.
  name?: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
  placeholder?: string
  description?: React.ReactNode
  required?: boolean
  disabled?: boolean
  value?: string
  defaultValue?: string
  // Called with the chosen value as `target.value`, like a native select's change event.
  onChange?: (event: { target: { value: string } }) => void
}) {
  return (
    <Field>
      <FormLabel htmlFor={id} label={label} required={required} />
      <SelectControl
        id={id}
        name={name}
        options={options}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => onChange?.({ target: { value: next ?? "" } })}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}
