import { Factory, Ship, Store } from "lucide-react"
import { useController } from "react-hook-form"
import { objectKeys } from "ts-extras"
import { useTranslations } from "use-intl"
import { AddressFields } from "@/components/address-fields"
import { FormInput } from "@/components/form-controls"
import { FormSelect } from "@/components/form-select"
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
import type { WorkspaceKind } from "@/lib/onboarding"
import { positionKeys } from "@/lib/onboarding"
import { formatPhone } from "@/lib/phone"

// Getting started's steps, in the order they come. Which ones a person sees depends on how they arrived.
export type WizardStep = "about" | "role" | "company" | "address"

// Each step's title, and for the address, what it's for.
export function useStepHeading(step: WizardStep, kind: WorkspaceKind | ""): { title: string; description?: string } {
  const t = useTranslations("onboarding.steps")
  if (step !== "address") {
    return { title: t(step) }
  }
  if (!kind) {
    return { title: t("address.none") }
  }
  return { title: t(`address.${kind}.title`), description: t(`address.${kind}.description`) }
}

export function AboutFields() {
  const t = useTranslations("onboarding")
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormInput name="person.firstName" required label={t("fields.firstName")} autoComplete="given-name" />
      <FormInput name="person.lastName" required label={t("fields.lastName")} autoComplete="family-name" />
      <FormSelect
        name="person.position"
        required
        label={t("fields.position")}
        placeholder={t("fields.choose")}
        // The position saves in English; only its label is translated.
        options={objectKeys(positionKeys).map((position) => ({
          value: position,
          label: t(`positions.${positionKeys[position]}`)
        }))}
        className="sm:col-span-2"
      />
    </div>
  )
}

const roles = [
  { kind: "buyer", icon: Store },
  { kind: "supplier", icon: Factory },
  { kind: "forwarder", icon: Ship }
] as const

// Buyer, supplier or freight forwarder, as cards to choose from. Arrow keys move between them.
export function RoleFields() {
  const t = useTranslations("onboarding.roles")
  const {
    field: { value, onChange, onBlur, ref },
    fieldState
  } = useController({ name: "kind" })
  return (
    <FieldSet data-invalid={fieldState.invalid}>
      <FieldLegend className="sr-only">{t("legend")}</FieldLegend>
      <RadioGroup
        ref={ref}
        value={value}
        // Picking one counts as touching the field, as closing a select's menu does, so an error clears at once.
        onValueChange={(next) => {
          onChange(next)
          onBlur()
        }}
        // Leaving the cards counts too; moving between them with the arrow keys doesn't.
        onBlur={(event) => {
          if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
            onBlur()
          }
        }}
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
                <FieldTitle>{t(`${role.kind}.title`)}</FieldTitle>
                <FieldDescription>{t(`${role.kind}.description`)}</FieldDescription>
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
  const t = useTranslations("onboarding.fields")
  return (
    <div className="grid gap-4">
      <FormInput name="company.name" required label={t("companyName")} autoComplete="organization" />
      <FormInput
        name="company.website"
        urlPrefix
        label={t("website")}
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        placeholder={t("websitePlaceholder")}
      />
      {/* Buyers see a supplier's phone number; nobody sees a buyer's or a forwarder's. */}
      {kind === "supplier" && (
        <FormInput
          name="company.phone"
          label={t("phone")}
          type="tel"
          autoComplete="tel"
          normalizeOnBlur={formatPhone}
        />
      )}
    </div>
  )
}

// Amazon needs a pickup phone number to schedule a supplier's collections.
export function AddressStepFields({ kind }: { kind: WorkspaceKind | "" }) {
  const t = useTranslations("onboarding.fields")
  return (
    <div className="flex flex-col gap-5">
      <FormInput name="address.name" required label={t("addressName")} autoComplete="off" />
      <AddressFields path="address.address" requirePhone={kind === "supplier"} />
    </div>
  )
}
