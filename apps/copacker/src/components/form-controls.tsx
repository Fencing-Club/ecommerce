"use client"

import { CalendarDays } from "lucide-react"
import { useId, useState } from "react"
import { useController } from "react-hook-form"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Textarea } from "@/components/ui/textarea"

// What every field bound to a form by `name` takes.
export type FormFieldProps = { name: string; label: string; description?: React.ReactNode; className?: string }

// A required field's label ends in a red star; fields without one are optional.
export function RequiredMark() {
  return (
    <span aria-hidden className="ms-0.5 text-destructive">
      *
    </span>
  )
}

export function FormLabel({ htmlFor, label, required }: { htmlFor?: string; label: string; required?: boolean }) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      {/* One span, so the star sits by the text rather than a label gap away. */}
      <span>
        {label}
        {required && <RequiredMark />}
      </span>
    </FieldLabel>
  )
}

// A date input the height of the other inputs, with a calendar icon in place of the browser's own. A click anywhere
// on it opens the browser's date picker.
export function DateInput({ className, onClick, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <InputGroup className={className}>
      <InputGroupInput
        {...props}
        type="date"
        data-empty={props.value === "" || undefined}
        onClick={(event) => {
          onClick?.(event)
          try {
            event.currentTarget.showPicker()
          } catch {
            // Without showPicker, or on a read-only input, the browser keeps its own way to pick a date.
          }
        }}
        className="data-empty:text-muted-foreground [&::-webkit-calendar-picker-indicator]:hidden"
      />
      <InputGroupAddon>
        <CalendarDays aria-hidden />
      </InputGroupAddon>
    </InputGroup>
  )
}

// Fields bound to the surrounding React Hook Form by `name`, with shadcn Field layout and per-field errors.

export function FormInput({
  name,
  label,
  description,
  className,
  type,
  urlPrefix = false,
  ...props
}: FormFieldProps & { urlPrefix?: boolean } & Omit<
    React.ComponentProps<typeof Input>,
    "name" | "value" | "defaultValue" | "onChange"
  >) {
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  const scheme = typeof fieldValue === "string" && /^http:\/\//i.test(fieldValue) ? "http://" : "https://"
  const control = {
    ...props,
    id,
    name: fieldName,
    ref,
    value: fieldValue ?? "",
    onChange,
    onBlur,
    "aria-invalid": fieldState.invalid,
    "aria-describedby": fieldState.invalid ? `${id}-error` : undefined
  }
  return (
    <Field data-invalid={fieldState.invalid} className={className}>
      <FormLabel htmlFor={id} label={label} required={props.required} />
      {urlPrefix && (
        <InputGroup dir="ltr">
          <InputGroupAddon>
            <InputGroupText>{scheme}</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            {...control}
            type="text"
            value={typeof fieldValue === "string" ? fieldValue.replace(/^https?:\/\//i, "") : ""}
            onChange={(event) => {
              const next = event.currentTarget.value.trim()
              if (!next) {
                onChange("")
              } else {
                onChange(/^[a-z][a-z\d+.-]*:\/\//i.test(next) ? next : `${scheme}${next}`)
              }
            }}
            onBlur={(event) => {
              onBlur()
              props.onBlur?.(event)
            }}
          />
        </InputGroup>
      )}
      {!urlPrefix && (type === "date" ? <DateInput {...control} /> : <Input {...control} type={type} />)}
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={[fieldState.error]} />
    </Field>
  )
}

// Numbers are stored as numbers, and an empty field as null: React Hook Form shows a field's default in place of
// undefined, so emptying it would bring the default back. Money goes in FormMoney. A whole number `step`, such as 1 for
// days or pieces, brings up a keypad without a decimal point.
export function FormNumber({
  name,
  label,
  description,
  className,
  onValueChange,
  ...props
}: FormFieldProps & { onValueChange?: (value: number | null) => void } & Omit<
    React.ComponentProps<typeof Input>,
    "name" | "value" | "defaultValue" | "onChange" | "type"
  >) {
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  const value = typeof fieldValue === "number" && Number.isFinite(fieldValue) ? fieldValue : ""
  return (
    <Field data-invalid={fieldState.invalid} className={className}>
      <FormLabel htmlFor={id} label={label} required={props.required} />
      <Input
        {...props}
        id={id}
        type="number"
        inputMode={Number.isInteger(Number(props.step)) ? "numeric" : "decimal"}
        name={fieldName}
        ref={ref}
        value={value}
        onChange={(event) => {
          const next = event.target.value === "" ? null : Math.round(event.target.valueAsNumber * 1000) / 1000
          onChange(next)
          onValueChange?.(next)
        }}
        onBlur={onBlur}
        aria-invalid={fieldState.invalid}
        aria-describedby={fieldState.invalid ? `${id}-error` : undefined}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={[fieldState.error]} />
    </Field>
  )
}

// A typed amount in minor units: "78.5", "1,250.00", or "78,50" from a keyboard with a decimal comma. Anything else is
// NaN, which fails validation as not a number, and an empty field is null, as in FormNumber.
function minorUnits(text: string) {
  const amount = text.trim()
  if (amount === "") {
    return null
  }
  const decimal = /^-?\d+,\d{1,2}$/.test(amount) ? amount.replace(",", ".") : amount
  if (!/^-?(\d{1,3}(,\d{3})+|\d*)(\.\d*)?$/.test(decimal) || !/\d/.test(decimal)) {
    return Number.NaN
  }
  return Math.round(Number(decimal.replaceAll(",", "")) * 100)
}

// Money, stored in whole minor units such as cents, beside its currency. It shows with its cents (78.50) except while
// it's being typed, and text that isn't an amount stays in view to fix.
export function FormMoney({
  name,
  label,
  description,
  className,
  currency,
  ...props
}: FormFieldProps & { currency: string } & Omit<
    React.ComponentProps<typeof InputGroupInput>,
    "name" | "value" | "defaultValue" | "onChange" | "onFocus" | "onBlur" | "type"
  >) {
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  // The text as typed, with the value it was read as. A value set another way, such as by a reset, replaces it.
  const [typed, setTyped] = useState<{ text: string; value: unknown } | null>(null)
  const formatted = typeof fieldValue === "number" && Number.isFinite(fieldValue) ? (fieldValue / 100).toFixed(2) : ""
  const shown = typed && Object.is(typed.value, fieldValue) ? typed.text : formatted
  return (
    <Field data-invalid={fieldState.invalid} className={className}>
      <FormLabel htmlFor={id} label={label} required={props.required} />
      <InputGroup>
        <InputGroupInput
          {...props}
          id={id}
          name={fieldName}
          ref={ref}
          inputMode="decimal"
          autoComplete="off"
          value={shown}
          onFocus={() => setTyped({ text: shown, value: fieldValue })}
          onChange={(event) => {
            const next = minorUnits(event.target.value)
            setTyped({ text: event.target.value, value: next })
            onChange(next)
          }}
          onBlur={() => {
            setTyped((current) => (current && Number.isNaN(current.value) ? current : null))
            onBlur()
          }}
          aria-invalid={fieldState.invalid}
          aria-describedby={fieldState.invalid ? `${id}-currency ${id}-error` : `${id}-currency`}
          className="text-end tabular-nums"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText id={`${id}-currency`}>{currency}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={[fieldState.error]} />
    </Field>
  )
}

export function FormTextarea({
  name,
  label,
  description,
  className,
  ...props
}: FormFieldProps & Omit<React.ComponentProps<typeof Textarea>, "name" | "value" | "defaultValue" | "onChange">) {
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  return (
    <Field data-invalid={fieldState.invalid} className={className}>
      <FormLabel htmlFor={id} label={label} required={props.required} />
      <Textarea
        {...props}
        id={id}
        name={fieldName}
        ref={ref}
        value={fieldValue ?? ""}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={fieldState.invalid}
        aria-describedby={fieldState.invalid ? `${id}-error` : undefined}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={[fieldState.error]} />
    </Field>
  )
}

export function FormCheckbox({ name, label, description, className }: FormFieldProps) {
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
        aria-describedby={fieldState.invalid ? `${id}-error` : undefined}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
        <FieldError id={`${id}-error`} errors={[fieldState.error]} />
      </FieldContent>
    </Field>
  )
}
