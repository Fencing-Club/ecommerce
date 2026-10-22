import { useTranslations } from "use-intl"
import { z } from "zod"
import { useActionForm } from "@/hooks/use-action-form"
import { isPosition, personSchema, positionKeys, positions, websiteSchema } from "@/lib/onboarding"
import { ActionForm } from "./action-form"
import { FormInput } from "./form-controls"
import { FormSelect } from "./form-select"

const schema = personSchema.extend({
  company: z.string().trim().min(1, "settings.profile.enterCompany").max(120),
  // The workspace's website, printed on its purchase orders. Only its owner and admins see and change it.
  website: websiteSchema.optional()
})

type Profile = z.input<typeof schema>

// A person's name, position and company, shown on their comments, in Settings. Getting started asks for them first.
export function ProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations("settings.profile")
  const positionNames = useTranslations("onboarding.positions")
  // A position saved before the list existed stays one of the choices.
  const options = [
    ...(profile.position && !positions.includes(profile.position) ? [profile.position] : []),
    ...positions
  ].map((position) => ({
    value: position,
    // Saved in English; a position typed before the list existed shows as it was saved.
    label: isPosition(position) ? positionNames(positionKeys[position]) : position
  }))
  const { form, submit } = useActionForm({
    schema,
    action: "profile.update",
    defaultValues: profile,
    // The fields show what was saved: the website with its https://.
    keepSaved: (saved) => saved
  })
  return (
    <ActionForm form={form} onSubmit={submit} layout="card" requireChange>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput name="firstName" required label={t("firstName")} autoComplete="given-name" />
        <FormInput name="lastName" required label={t("lastName")} autoComplete="family-name" />
        <FormSelect name="position" required label={t("position")} placeholder={t("choose")} options={options} />
        <FormInput name="company" required label={t("company")} autoComplete="organization" />
        {profile.website !== undefined && (
          <FormInput
            name="website"
            urlPrefix
            label={t("website")}
            inputMode="url"
            placeholder="example.com"
            autoComplete="url"
            spellCheck={false}
          />
        )}
      </div>
    </ActionForm>
  )
}
