"use client"

import { CalendarDays } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useController } from "react-hook-form"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type Common = { name: string; label: string; description?: React.ReactNode; className?: string }

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
  ...props
}: Common & Omit<React.ComponentProps<typeof Input>, "name" | "value" | "defaultValue" | "onChange">) {
  const id = useId()
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  const control = {
    ...props,
    id,
    name: fieldName,
    ref,
    value: fieldValue ?? "",
    onChange,
    onBlur,
    "aria-invalid": fieldState.invalid
  }
  return (
    <Field data-invalid={fieldState.invalid} className={className}>
      <FormLabel htmlFor={id} label={label} required={props.required} />
      {type === "date" ? <DateInput {...control} /> : <Input {...control} type={type} />}
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

// Numbers are stored as numbers; money goes in FormMoney. A whole number `step`, such as 1 for days or pieces, brings up
// a keypad without a decimal point.
export function FormNumber({
  name,
  label,
  description,
  className,
  onValueChange,
  ...props
}: Common & { onValueChange?: (value: number | undefined) => void } & Omit<
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
          const next = event.target.value === "" ? undefined : Math.round(event.target.valueAsNumber * 1000) / 1000
          onChange(next)
          onValueChange?.(next)
        }}
        onBlur={onBlur}
        aria-invalid={fieldState.invalid}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

// A typed amount in minor units: "78.5", "1,250.00", or "78,50" from a keyboard with a decimal comma. Anything else is
// NaN, which fails validation as not a number, and an empty field is undefined.
function minorUnits(text: string) {
  const amount = text.trim()
  if (amount === "") {
    return undefined
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
}: Common & { currency: string } & Omit<
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
          aria-describedby={`${id}-currency`}
          className="text-end tabular-nums"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText id={`${id}-currency`}>{currency}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

type SelectProps = Common & { options: Option[]; placeholder?: string; required?: boolean }

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
