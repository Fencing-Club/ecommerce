import { useInterval } from "@mantine/hooks"
import { useState } from "react"
import { FormProvider } from "react-hook-form"
import { useTranslations } from "use-intl"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { Button } from "@/components/ui/button"
import { useAuthForm } from "@/hooks/use-auth-form"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"
import { codeSchema } from "@/lib/sign-in"
import { CodeField } from "./code-field"
import { leaving } from "./sign-in-form"

// Seconds before another code can be sent. The page opens just after one was.
const cooldown = 30

// The code WorkOS emailed. It sends itself once all six digits are in; a wrong one clears for another try.
export function VerifyEmailForm() {
  const t = useTranslations("auth")
  const { form, submit } = useAuthForm({
    schema: codeSchema,
    action: "auth.verifyEmail",
    defaultValues: { code: "" }
  })
  async function send() {
    if (form.formState.isSubmitting) {
      return
    }
    await submit()
    if (form.formState.errors.root) {
      form.setValue("code", "")
      form.setFocus("code")
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
          noValidate
          className="flex flex-col gap-6"
        >
          <CodeField name="code" label={t("fields.verificationCode")} onComplete={() => void send()} />
          <FormError message={form.formState.errors.root?.server?.message} />
          <SubmitButton type="submit" className="h-10 w-full" pending={leaving(form.formState)}>
            {t("verifyEmail.submit")}
          </SubmitButton>
        </form>
      </FormProvider>
      <ResendCode />
    </div>
  )
}

function ResendCode() {
  const t = useTranslations("auth.verifyEmail")
  const [run, { isLoading }] = useActionMutation()
  const errorMessage = useErrorMessage()
  const [wait, setWait] = useState(cooldown)
  const [status, setStatus] = useState("")
  useInterval(() => setWait((seconds) => Math.max(0, seconds - 1)), 1000, { autoInvoke: true })
  async function resend() {
    setStatus("")
    try {
      await run({ action: "auth.resendCode", data: {} }).unwrap()
      setWait(cooldown)
      setStatus(t("newCodeSent"))
    } catch (error) {
      setStatus(errorMessage(error))
    }
  }
  return (
    <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
      <p>
        {t("didntGetIt")}{" "}
        <Button
          variant="link"
          className="h-auto p-0 font-medium text-foreground"
          disabled={wait > 0 || isLoading}
          onClick={() => void resend()}
        >
          {wait > 0 ? t("sendAgainIn", { seconds: wait }) : t("sendNewCode")}
        </Button>
      </p>
      <output aria-live="polite" className="min-h-5 text-xs">
        {status}
      </output>
    </div>
  )
}
