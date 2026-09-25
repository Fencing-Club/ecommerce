"use client"

import { useId } from "react"
import { useController } from "react-hook-form"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import * as styles from "./form-controls.css"

type Common = { name: string; label: string; description?: React.ReactNode; className?: string }
type Option = { value: string; label: string; disabled?: boolean }

// Fields bound to the surrounding React Hook Form by `name`, with shadcn Field layout and per-field errors.

export function FormInput({
  name,
  label,
  description,
  className,
  ...props
}: Common & Omit<React.ComponentProps<typeof Input>, "name" | "value" | "defaultValue" | "onChange">) {
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  return (
    <Field data-invalid={fieldState.invalid} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...props}
        id={id}
        name={fieldName}
        ref={ref}
        value={fieldValue ?? ""}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={fieldState.invalid}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

// Numbers are stored as numbers. `scale` converts display units to stored units, such as dollars to cents.
export function FormNumber({
  name,
  label,
  description,
  className,
  scale = 1,
  ...props
}: Common & { scale?: number } & Omit<
    React.ComponentProps<typeof Input>,
    "name" | "value" | "defaultValue" | "onChange" | "type"
  >) {
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  const value = typeof fieldValue === "number" && Number.isFinite(fieldValue) ? fieldValue / scale : ""
  return (
    <Field data-invalid={fieldState.invalid} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...props}
        id={id}
        type="number"
        inputMode="decimal"
        name={fieldName}
        ref={ref}
        value={value}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : Math.round(event.target.valueAsNumber * scale * 1000) / 1000)
        }
        onBlur={onBlur}
        aria-invalid={fieldState.invalid}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

export function FormSelect({
  name,
  label,
  description,
  className,
  options,
  placeholder
}: Common & { options: Option[]; placeholder?: string }) {
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  return (
    <Field data-invalid={fieldState.invalid} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        className={styles.fullWidth}
        name={fieldName}
        ref={ref}
        value={fieldValue ?? ""}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={fieldState.invalid}
      >
        {placeholder !== undefined && <NativeSelectOption value="">{placeholder}</NativeSelectOption>}
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

export function FormTextarea({
  name,
  label,
  description,
  className,
  ...props
}: Common & Omit<React.ComponentProps<typeof Textarea>, "name" | "value" | "defaultValue" | "onChange">) {
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  return (
    <Field data-invalid={fieldState.invalid} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        {...props}
        id={id}
        name={fieldName}
        ref={ref}
        value={fieldValue ?? ""}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={fieldState.invalid}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

export function FormCheckbox({ name, label, description, className }: Common) {
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  return (
    <Field orientation="horizontal" data-invalid={fieldState.invalid} className={className}>
      <Checkbox
        id={id}
        ref={ref}
        name={fieldName}
        checked={Boolean(fieldValue)}
        onCheckedChange={onChange}
        onBlur={onBlur}
        aria-invalid={fieldState.invalid}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
        <FieldError errors={[fieldState.error]} />
      </FieldContent>
    </Field>
  )
}
