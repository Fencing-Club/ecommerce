"use client"

import { useId, useRef } from "react"
import { useController } from "react-hook-form"
import { FormLabel, type FormFieldProps } from "@/components/form-controls"
import { Field, FieldDescription, FieldError } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

// Select fields, apart from the text fields in form-controls: Base UI's Select is the heaviest control, so a page with
// only text fields, such as the contact page, doesn't download it.

type Option = { value: string; label: string; disabled?: boolean }
// `clears` marks an optional field's placeholder, offered as a choice that empties the value.
type Choice = Option & { clears?: boolean }

// Base UI's Select can't hold an empty string, so an empty option, such as None, carries this value instead.
const emptyChoice = "\u0000empty"

// A shadcn select of string options, for FormSelect, SelectField and the address country. An empty option, such as
// None, is a choice of its own. On an optional field the placeholder is one too, as in a native select, so the value
// can be cleared.
export function SelectControl({
  id,
  name,
  options,
  placeholder,
  required,
  disabled,
  invalid,
  value,
  defaultValue,
  autoComplete,
  onValueChange,
  onBlur,
  ref
}: {
  id: string
  // Submits the value with a native form.
  name?: string
  options: Option[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  // Null when controlled and empty; leave it undefined to use `defaultValue` instead.
  value?: string | null
  defaultValue?: string
  autoComplete?: string
  onValueChange?: (value: string | undefined) => void
  onBlur?: () => void
  ref?: React.Ref<HTMLButtonElement>
}) {
  // Opening the menu moves focus out of the trigger. That isn't leaving the field, so it doesn't count as a blur, which
  // would show a required field's error while its menu is still open; closing the menu does.
  const open = useRef(false)
  const hasEmpty = options.some((option) => option.value === "")
  const choices: Choice[] = [
    ...(placeholder !== undefined && !required && !hasEmpty ? [{ value: "", label: placeholder, clears: true }] : []),
    ...options
  ].map((option) => ({ ...option, value: option.value || emptyChoice }))
  // An empty value shows the empty option when there is one, and the placeholder otherwise.
  const choice = (current: string | null | undefined) => {
    if (current) {
      return current
    }
    return current === "" && hasEmpty ? emptyChoice : null
  }
  return (
    <Select
      items={choices}
      name={name}
      required={required}
      disabled={disabled}
      autoComplete={autoComplete}
      {...(value === undefined ? { defaultValue: choice(defaultValue) } : { value: choice(value) })}
      onValueChange={(next) => onValueChange?.(next === emptyChoice ? "" : (next ?? undefined))}
      onOpenChange={(next) => {
        open.current = next
        if (!next) {
          onBlur?.()
        }
      }}
    >
      <SelectTrigger
        id={id}
        ref={ref}
        onBlur={() => {
          if (!open.current) {
            onBlur?.()
          }
        }}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className="w-full"
      >
        <SelectValue>
          {(current: string | null) => {
            const option = choices.find((candidate) => candidate.value === current)
            return option && !option.clears ? (
              option.label
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {choices.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={cn(option.clears && "text-muted-foreground")}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type SelectProps = FormFieldProps & { options: Option[]; placeholder?: string; required?: boolean }

export function FormSelect({ name, label, description, className, options, placeholder, required }: SelectProps) {
  const id = useId()
  const {
    field: { ref, value, onChange, onBlur },
    fieldState
  } = useController({ name })
  return (
    <Field data-invalid={fieldState.invalid} className={className}>
      <FormLabel htmlFor={id} label={label} required={required} />
      <SelectControl
        id={id}
        ref={ref}
        options={options}
        placeholder={placeholder}
        required={required}
        invalid={fieldState.invalid}
        value={typeof value === "string" ? value : null}
        onValueChange={onChange}
        onBlur={onBlur}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={[fieldState.error]} />
    </Field>
  )
}
