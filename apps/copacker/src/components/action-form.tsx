import type { UseFormReturn } from "react-hook-form"
import { type FieldValues, FormProvider } from "react-hook-form"
import { useTranslations } from "use-intl"
import { FormError, SubmitButton } from "./form-feedback"
import { Button } from "./ui/button"
import { DialogClose, DialogFooter } from "./ui/dialog"
import { FieldGroup } from "./ui/field"
import { sx } from "@/styles/sprinkles.css"

// Lays out a submission form: its fields, the server error, and the submit button. In a dialog, the
// buttons sit in the dialog's footer with Cancel.
export function ActionForm<Values extends FieldValues>({
  form,
  onSubmit,
  label,
  dialog = false,
  children
}: {
  form: UseFormReturn<Values, unknown, FieldValues>
  onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>
  label: string
  dialog?: boolean
  children: React.ReactNode
}) {
  const t = useTranslations("common.actions")
  const submit = (
    <SubmitButton type="submit" pending={form.formState.isSubmitting} disabled={!dialog && !form.formState.isDirty}>
      {label}
    </SubmitButton>
  )
  return (
    <FormProvider {...form}>
      <form
        onSubmit={onSubmit}
        noValidate
        className={dialog ? sx({ display: "flex", flexDirection: "column", gap: 4 }) : undefined}
      >
        <FieldGroup>
          {children}
          <FormError message={form.formState.errors.root?.server?.message} />
          {!dialog && <div>{submit}</div>}
        </FieldGroup>
        {dialog && (
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
            {submit}
          </DialogFooter>
        )}
      </form>
    </FormProvider>
  )
}
