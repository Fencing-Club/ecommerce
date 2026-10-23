import {
  Button,
  Card,
  CardContent,
  CardFooter,
  DialogClose,
  DialogFooter,
  FieldGroup
} from "@buildkitgg/shadcn-baseui-kit"
import { Check } from "lucide-react"
import type { UseFormReturn } from "react-hook-form"
import { type FieldValues, FormProvider, useFormState } from "react-hook-form"
import { useTranslations } from "use-intl"
import { cn } from "@/lib/utils"
import { FormServerError, SubmitButton } from "./form-feedback"

// Taller fields than the portal's, for the few forms someone meets before it. An invitation's email is fixed, and
// looks it.
const authFields =
  "[&_[data-slot=input]]:h-10 [&_[data-slot=input]:read-only]:bg-muted [&_[data-slot=input]:read-only]:text-muted-foreground"

// Lays out a form that submits through an action: its fields, the server's error, and the submit button.
// - inline: the button under the fields, on a page.
// - dialog: Cancel and the button in the dialog's footer.
// - card: a settings card, with Save at the right of its footer. It stays outlined until something changes, so a page
//   of these cards doesn't read as a column of orange buttons, and says Saved once it is.
// - auth: the taller, full-width button of the sign-in pages, which spins until the next page opens.
// `requireChange` keeps the button disabled until a field changes. The form's state is read here through
// useFormState, so the button follows edits however the parent is memoized.
export function ActionForm<Values extends FieldValues>({
  form,
  onSubmit,
  label,
  layout = "inline",
  requireChange = false,
  children
}: {
  form: UseFormReturn<Values, unknown, FieldValues>
  onSubmit: (event?: React.BaseSyntheticEvent) => unknown
  // Save, unless it says otherwise.
  label?: string
  layout?: "inline" | "dialog" | "card" | "auth"
  requireChange?: boolean
  children: React.ReactNode
}) {
  const t = useTranslations("common.actions")
  const { isDirty, isSubmitting, isSubmitSuccessful } = useFormState({ control: form.control })
  const button = (
    <SubmitButton
      type="submit"
      variant={layout === "card" && !isDirty ? "outline" : "default"}
      className={cn(layout === "auth" && "h-10 w-full")}
      // After signing in, the next page is a new document: the button spins until it replaces this one.
      pending={isSubmitting || (layout === "auth" && isSubmitSuccessful)}
      disabled={requireChange && !isDirty}
    >
      {label ?? t("save")}
    </SubmitButton>
  )
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    // A dialog opened from inside another form, such as a shipment's packing, is in that form's React tree, which
    // would submit it too.
    event.stopPropagation()
    void onSubmit(event)
  }
  let content: React.ReactNode
  if (layout === "dialog") {
    content = (
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FieldGroup>
          {children}
          <FormServerError />
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
          {button}
        </DialogFooter>
      </form>
    )
  } else if (layout === "card") {
    content = (
      <form onSubmit={submit} noValidate>
        <Card>
          <CardContent>
            <FieldGroup>
              {children}
              <FormServerError />
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end gap-3">
            {isSubmitSuccessful && !isDirty && (
              <output className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3.5" aria-hidden />
                {t("saved")}
              </output>
            )}
            {button}
          </CardFooter>
        </Card>
      </form>
    )
  } else if (layout === "auth") {
    content = (
      <form onSubmit={submit} noValidate className={cn("flex flex-col gap-6", authFields)}>
        <FieldGroup>{children}</FieldGroup>
        <FormServerError />
        {button}
      </form>
    )
  } else {
    content = (
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          {children}
          <FormServerError />
          <div>{button}</div>
        </FieldGroup>
      </form>
    )
  }
  return <FormProvider {...form}>{content}</FormProvider>
}

// Keeps Enter in a text field from submitting a form that only its button should submit, such as one that creates a
// purchase order or finishes packing. Buttons still press, text areas still start a new line, and a dialog opened from
// the form keeps its own Enter: its fields belong to its own form.
export function keepEnterFromSubmitting(event: React.KeyboardEvent<HTMLFormElement>) {
  if (
    event.key === "Enter" &&
    !event.nativeEvent.isComposing &&
    event.target instanceof HTMLInputElement &&
    event.target.form === event.currentTarget
  ) {
    event.preventDefault()
  }
}
