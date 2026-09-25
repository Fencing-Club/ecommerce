import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import * as styles from "./form-fields.css"

type Option = { value: string; label: string; disabled?: boolean }

export function TextField({
  label,
  name,
  id = name,
  description,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; description?: React.ReactNode }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

export function SelectField({
  label,
  id,
  options,
  placeholder,
  description,
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & {
  label: string
  id: string
  options: Option[]
  placeholder?: string
  description?: React.ReactNode
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} className={styles.fullWidth} {...props}>
        {placeholder !== undefined && <NativeSelectOption value="">{placeholder}</NativeSelectOption>}
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}
