import { FormField, fieldControl } from "./form-controls"
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
  onValueChange
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
  // Called with the chosen value, or an empty one when the choice is cleared.
  onValueChange?: (value: string) => void
}) {
  return (
    <FormField id={id} label={label} required={required} description={description} error={error}>
      <SelectControl
        {...fieldControl(id, { description, error })}
        name={name}
        options={options}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => onValueChange?.(next ?? "")}
      />
    </FormField>
  )
}
