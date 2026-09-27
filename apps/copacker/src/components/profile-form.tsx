"use client"

import { useRouter } from "next/navigation"
import { FormProvider } from "react-hook-form"
import { z } from "zod"
import { FieldGroup } from "@/components/ui/field"
import { useActionForm } from "@/hooks/useActionForm"
import { FormError, SubmitButton } from "./actions"
import { FormChoice, FormInput } from "./form-controls"

const schema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(60),
  lastName: z.string().trim().min(1, "Enter your last name").max(60),
  position: z.string().trim().min(1, "Choose your position").max(100),
  company: z.string().trim().min(1, "Enter your company").max(120)
})

type Profile = z.input<typeof schema>

// Roles at buyers, suppliers and freight forwarders.
const positions = [
  "Owner",
  "General manager",
  "Operations manager",
  "Purchasing manager",
  "Buyer",
  "Sales manager",
  "Account manager",
  "Production manager",
  "Quality control",
  "Logistics coordinator",
  "Warehouse manager",
  "Customer service",
  "Finance",
  "Other"
]

// A person's name, position and company, shown on their comments. `then` is where to go once it's saved, when asked
// for before starting.
export function ProfileForm({ profile, then }: { profile: Profile; then?: string }) {
  const router = useRouter()
  // A position saved before the list existed stays one of the choices.
  const options = [
    ...(profile.position && !positions.includes(profile.position) ? [profile.position] : []),
    ...positions
  ].map((position) => ({ value: position, label: position }))
  const { form, submit } = useActionForm({
    schema,
    action: "profile.update",
    defaultValues: profile,
    keepSaved: true,
    onSuccess: () => {
      if (then) {
        router.push(then)
      }
    }
  })
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <FormInput name="firstName" required label="First name" autoComplete="given-name" />
          <FormInput name="lastName" required label="Last name" autoComplete="family-name" />
          <FormChoice name="position" required label="Position" placeholder="Choose" options={options} />
          <FormInput name="company" required label="Company" autoComplete="organization" />
        </FieldGroup>
        <FormError message={form.formState.errors.root?.server?.message} />
        <SubmitButton type="submit" className="self-start" pending={form.formState.isSubmitting}>
          {then ? "Continue" : "Save"}
        </SubmitButton>
      </form>
    </FormProvider>
  )
}
