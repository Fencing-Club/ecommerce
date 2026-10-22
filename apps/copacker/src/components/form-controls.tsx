import { CalendarDays } from "lucide-react"
import { useId, useState } from "react"
import { useController } from "react-hook-form"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

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

export function FormLabel({
  htmlFor,
  label,
  required,
  className
}: {
  htmlFor?: string
  label: string
  required?: boolean
  className?: string
}) {
  return (
    <FieldLabel htmlFor={htmlFor} className={className}>
      {/* One span, so the star sits by the text rather than a label gap away. */}
      <span>
        {label}
        {required && <RequiredMark />}
      </span>
    </FieldLabel>
  )
}

// What a field's control takes from its FormField: its id, whether it's invalid, and the ids of what describes it.
// Only a description or error that shows is listed, so every id it names is on the page. `describedBy` adds others
// first, such as an amount's currency.
export function fieldControl(
  id: string,
  { description, error, describedBy }: { description?: React.ReactNode; error?: string; describedBy?: string }
) {
  const ids = [describedBy, description ? `${id}-description` : undefined, error ? `${id}-error` : undefined]
  return {
    id,
    "aria-invalid": Boolean(error),
    "aria-describedby": ids.filter(Boolean).join(" ") || undefined
  }
}

// Binds a field to the surrounding React Hook Form by `name`. `fieldProps` go to its FormField and `controlProps` to
// its control, which links the two.
export function useFormField(
  name: string,
  { description, describedBy }: { description?: React.ReactNode; describedBy?: string } = {}
) {
  const id = useId()
  const { field, fieldState } = useController({ name })
  const error = fieldState.error?.message
  return {
    field,
    error,
    fieldProps: { id, description, error },
    controlProps: fieldControl(id, { description, error, describedBy })
  }
}

// A field's label, its control, then its description and error, which the control's `fieldControl` props point at.
// A horizontal field, such as a checkbox, puts the control first.
export function FormField({
  id,
  label,
  required,
  description,
  error,
  orientation = "vertical",
  labelAction,
  hideLabel = false,
  className,
  children
}: {
  // The control's.
  id: string
  label: string
  required?: boolean
  description?: React.ReactNode
  // The field's message when it fails its check, as text or a full message key.
  error?: string
  orientation?: "vertical" | "horizontal"
  // Sits across from the label, such as "Forgot password?".
  labelAction?: React.ReactNode
  // Names the control for screen readers only, when what it's for shows another way.
  hideLabel?: boolean
  className?: string
  children: React.ReactNode
}) {
  const labelElement = (
    <FormLabel htmlFor={id} label={label} required={required} className={cn(hideLabel && "sr-only")} />
  )
  const notes = (
    <>
      {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </>
  )
  if (orientation === "horizontal") {
    return (
      <Field orientation="horizontal" data-invalid={Boolean(error)} className={className}>
        {children}
        <FieldContent>
          {labelElement}
          {notes}
        </FieldContent>
      </Field>
    )
  }
  return (
    <Field data-invalid={Boolean(error)} className={className}>
      {labelAction ? (
        <div className="flex items-center justify-between gap-2">
          {labelElement}
          {labelAction}
        </div>
      ) : (
        labelElement
      )}
      {children}
      {notes}
    </Field>
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

// Fields bound to the surrounding React Hook Form by `name`, each in a FormField.

export function FormInput({
  name,
  label,
  description,
  className,
  type,
  urlPrefix = false,
  normalizeOnBlur,
  ...props
}: FormFieldProps & { urlPrefix?: boolean; normalizeOnBlur?: (value: string) => string } & Omit<
    React.ComponentProps<typeof Input>,
    "name" | "value" | "defaultValue" | "onChange"
  >) {
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldProps,
    controlProps
  } = useFormField(name, { description })
  const scheme = typeof fieldValue === "string" && /^http:\/\//i.test(fieldValue) ? "http://" : "https://"
  const control = {
    ...props,
    ...controlProps,
    name: fieldName,
    ref,
    value: fieldValue ?? "",
    onChange,
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
      if (normalizeOnBlur) {
        onChange(normalizeOnBlur(event.currentTarget.value))
      }
      onBlur()
      props.onBlur?.(event)
    }
  }
  return (
    <FormField {...fieldProps} label={label} required={props.required} className={className}>
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
    </FormField>
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
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldProps,
    controlProps
  } = useFormField(name, { description })
  const value = typeof fieldValue === "number" && Number.isFinite(fieldValue) ? fieldValue : ""
  return (
    <FormField {...fieldProps} label={label} required={props.required} className={className}>
      <Input
        {...props}
        {...controlProps}
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
      />
    </FormField>
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
  const currencyId = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldProps,
    controlProps
  } = useFormField(name, { description, describedBy: currencyId })
  // The text as typed, with the value it was read as. A value set another way, such as by a reset, replaces it.
  const [typed, setTyped] = useState<{ text: string; value: unknown } | null>(null)
  const formatted = typeof fieldValue === "number" && Number.isFinite(fieldValue) ? (fieldValue / 100).toFixed(2) : ""
  const shown = typed && Object.is(typed.value, fieldValue) ? typed.text : formatted
  return (
    <FormField {...fieldProps} label={label} required={props.required} className={className}>
      <InputGroup>
        <InputGroupInput
          {...props}
          {...controlProps}
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
          className="text-end tabular-nums"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText id={currencyId}>{currency}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </FormField>
  )
}

export function FormTextarea({
  name,
  label,
  description,
  className,
  ...props
}: FormFieldProps & Omit<React.ComponentProps<typeof Textarea>, "name" | "value" | "defaultValue" | "onChange">) {
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldProps,
    controlProps
  } = useFormField(name, { description, describedBy: props["aria-describedby"] })
  return (
    <FormField {...fieldProps} label={label} required={props.required} className={className}>
      <Textarea
        {...props}
        {...controlProps}
        name={fieldName}
        ref={ref}
        value={fieldValue ?? ""}
        onChange={onChange}
        onBlur={onBlur}
      />
    </FormField>
  )
}

export function FormCheckbox({ name, label, description, className }: FormFieldProps) {
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldProps,
    controlProps
  } = useFormField(name, { description })
  return (
    <FormField {...fieldProps} label={label} orientation="horizontal" className={className}>
      <Checkbox
        {...controlProps}
        ref={ref}
        name={fieldName}
        checked={Boolean(fieldValue)}
        onCheckedChange={onChange}
        onBlur={onBlur}
      />
    </FormField>
  )
}
