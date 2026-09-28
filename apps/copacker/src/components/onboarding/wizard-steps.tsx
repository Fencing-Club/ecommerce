"use client"

import { Factory, Ship, Store } from "lucide-react"
import { useController } from "react-hook-form"
import { AddressFields } from "@/components/address-fields"
import { FormInput, FormSelect } from "@/components/form-controls"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { positions, type WorkspaceKind } from "@/lib/onboarding"

// Getting started's steps, in the order they come. Which ones a person sees depends on how they arrived.
export type WizardStep = "about" | "role" | "company" | "address"

// Each step's title, and for the address, what it's for.
export function stepHeading(step: WizardStep, kind: WorkspaceKind | "") {
  switch (step) {
    case "about":
      return { title: "About you" }
    case "role":
      return { title: "What does your company do?" }
    case "company":
      return { title: "Your company" }
    case "address":
      return {
        buyer: { title: "Delivery address", description: "Where purchase orders are delivered" },
        supplier: { title: "Pickup address", description: "Where carriers collect your cartons" },
        forwarder: { title: "Warehouse address", description: "Where buyers send goods for you" },
        "": { title: "Address" }
      }[kind]
  }
}

// The saved address's name to start from, which the person can change.
export const addressNames: Record<WorkspaceKind, string> = {
  buyer: "Warehouse",
  supplier: "Factory",
  forwarder: "Warehouse"
}

export function AboutFields() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormInput name="person.firstName" required label="First name" autoComplete="given-name" />
      <FormInput name="person.lastName" required label="Last name" autoComplete="family-name" />
      <FormSelect
        name="person.position"
        required
        label="Position"
        placeholder="Choose"
        options={positions.map((position) => ({ value: position, label: position }))}
        className="sm:col-span-2"
      />
    </div>
  )
}

const roles = [
  { kind: "buyer", title: "Buyer", description: "Buy from suppliers and sell on Amazon or Shopify", icon: Store },
  { kind: "supplier", title: "Supplier", description: "Make products and fill purchase orders", icon: Factory },
  {
    kind: "forwarder",
    title: "Freight forwarder",
    description: "Receive goods and ship them on for buyers",
    icon: Ship
  }
] as const

// Buyer, supplier or freight forwarder, as cards to choose from. Arrow keys move between them.
export function RoleFields() {
  const {
    field: { value, onChange, ref },
    fieldState
  } = useController({ name: "kind" })
  return (
    <FieldSet data-invalid={fieldState.invalid}>
      <FieldLegend className="sr-only">What your company does</FieldLegend>
      <RadioGroup
        ref={ref}
        value={value}
        onValueChange={onChange}
        // Enter continues, as it does from a browser's own radio buttons.
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.closest("form")?.requestSubmit()
          }
        }}
        aria-invalid={fieldState.invalid}
        className="gap-3"
      >
        {roles.map((role) => (
          <FieldLabel
            key={role.kind}
            htmlFor={`role-${role.kind}`}
            className="*:data-[slot=field]:p-4 has-[>[data-slot=field]]:rounded-xl"
          >
            <Field orientation="horizontal" className="items-center gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-has-data-checked/field-label:bg-primary group-has-data-checked/field-label:text-primary-foreground">
                <role.icon className="size-5" aria-hidden />
              </span>
              <FieldContent>
                <FieldTitle>{role.title}</FieldTitle>
                <FieldDescription>{role.description}</FieldDescription>
              </FieldContent>
              <RadioGroupItem value={role.kind} id={`role-${role.kind}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      <FieldError errors={[fieldState.error]} />
    </FieldSet>
  )
}

export function CompanyFields({ kind }: { kind: WorkspaceKind | "" }) {
  return (
    <div className="grid gap-4">
      <FormInput name="company.name" required label="Company name" autoComplete="organization" />
      <FormInput
        name="company.website"
        label="Website"
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        placeholder="example.com"
      />
      {/* Buyers see a supplier's phone number; nobody sees a buyer's or a forwarder's. */}
      {kind === "supplier" && <FormInput name="company.phone" label="Phone number" type="tel" autoComplete="tel" />}
    </div>
  )
}

// Amazon needs a pickup phone number to schedule a supplier's collections.
export function AddressStepFields({ kind }: { kind: WorkspaceKind | "" }) {
  return (
    <div className="flex flex-col gap-5">
      <FormInput name="address.name" required label="Address name" autoComplete="off" />
      <AddressFields path="address.address" requirePhone={kind === "supplier"} />
    </div>
  )
}
