"use client"

import { useId, useState } from "react"
import { useController } from "react-hook-form"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { cn } from "@/lib/utils"

const length = 6

// A six-digit code, drawn as six boxes. One real input underneath takes the typing, pasting and the browser's
// autofill from the email, so it reads and behaves as a single field; `onComplete` runs when the sixth digit lands.
export function CodeField({
  name,
  label,
  onComplete
}: {
  name: string
  label: string
  onComplete: (code: string) => void
}) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const {
    field: { ref, value: fieldValue, onChange, onBlur, name: fieldName },
    fieldState
  } = useController({ name })
  const value = typeof fieldValue === "string" ? fieldValue : ""
  const slot = (index: number) => {
    const current = focused && index === Math.min(value.length, length - 1)
    return (
      <span
        key={index}
        className={cn(
          "relative flex h-12 min-w-0 flex-1 items-center justify-center rounded-lg border border-input bg-background font-mono text-xl font-medium tabular-nums shadow-xs transition-[border-color,box-shadow] dark:bg-input/30",
          current && "border-ring ring-3 ring-ring/50",
          fieldState.invalid && "border-destructive",
          fieldState.invalid && current && "ring-destructive/20"
        )}
      >
        {value[index] ?? ""}
        {current && value.length < length && (
          <span className="absolute h-6 w-px bg-foreground motion-safe:animate-pulse" />
        )}
      </span>
    )
  }
  return (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={id} className="sr-only">
        {label}
      </FieldLabel>
      <div className="relative">
        <input
          id={id}
          ref={ref}
          name={fieldName}
          value={value}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, length)
            onChange(digits)
            if (digits.length === length) {
              onComplete(digits)
            }
          }}
          onFocus={(event) => {
            setFocused(true)
            // The caret always sits after the last digit, where the boxes show it.
            const end = event.target.value.length
            event.target.setSelectionRange(end, end)
          }}
          onBlur={() => {
            setFocused(false)
            onBlur()
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length}
          spellCheck={false}
          aria-invalid={fieldState.invalid}
          className="absolute inset-0 z-10 size-full cursor-text text-base caret-transparent opacity-0"
        />
        <div aria-hidden className="flex items-center gap-2">
          {[0, 1, 2].map(slot)}
          <span className="h-px w-3 shrink-0 bg-border" />
          {[3, 4, 5].map(slot)}
        </div>
      </div>
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}
