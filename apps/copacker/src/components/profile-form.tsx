"use client"

import { z } from "zod"
import { useActionForm } from "@/hooks/useActionForm"
import { personSchema, positions, websiteSchema } from "@/lib/onboarding"
import { FormInput, FormSelect } from "./form-controls"
import { SettingsForm } from "./settings-forms"

const schema = personSchema.extend({
  company: z.string().trim().min(1, "Enter your company").max(120),
  // The workspace's website, printed on its purchase orders. Only its owner sees and changes it.
  website: websiteSchema.optional()
})

type Profile = z.input<typeof schema>

// A person's name, position and company, shown on their comments, in Settings. Getting started asks for them first.
export function ProfileForm({ profile }: { profile: Profile }) {
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
    // The website shows as saved, with its https://.
    onSuccess: () =>
      form.resetField("website", { defaultValue: websiteSchema.safeParse(form.getValues("website")).data })
  })
  return (
    <SettingsForm form={form} onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput name="firstName" required label="First name" autoComplete="given-name" />
        <FormInput name="lastName" required label="Last name" autoComplete="family-name" />
        <FormSelect name="position" required label="Position" placeholder="Choose" options={options} />
        <FormInput name="company" required label="Company" autoComplete="organization" />
        {profile.website !== undefined && (
          <FormInput
            name="website"
            label="Company website"
            inputMode="url"
            placeholder="example.com"
            autoComplete="url"
            spellCheck={false}
          />
        )}
      </div>
    </SettingsForm>
  )
}
