import { Field, FieldDescription, FieldError } from "@/components/ui/field"
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
  error,
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
  // The form's own message when the field fails its check.
  error?: string
  value?: string
  defaultValue?: string
  // Called with the chosen value as `target.value`, like a native select's change event.
  onChange?: (event: { target: { value: string } }) => void
}) {
  return (
    <Field data-invalid={!!error}>
      <FormLabel htmlFor={id} label={label} required={required} />
      <SelectControl
        id={id}
        name={name}
        options={options}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        invalid={!!error}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => onChange?.({ target: { value: next ?? "" } })}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  )
}
