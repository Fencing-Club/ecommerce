import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { useInterval } from "@mantine/hooks"
import { useState } from "react"
import { useFormState } from "react-hook-form"
import { useTranslations } from "use-intl"
import { ActionForm } from "@/components/action-form"
import { useAction } from "@/hooks/use-action"
import { useActionForm } from "@/hooks/use-action-form"
import { codeSchema } from "@/lib/sign-in"
import { CodeField } from "./code-field"

// Seconds before another code can be sent. The page opens just after one was.
const cooldown = 30

// The code WorkOS emailed. It sends itself once all six digits are in; a wrong one clears for another try.
export function VerifyEmailForm() {
  const t = useTranslations("auth")
  const { form, submit } = useActionForm({
    schema: codeSchema,
    action: "auth.verifyEmail",
    navigation: "document",
    defaultValues: { code: "" },
    onError: () => {
      form.setValue("code", "")
      form.setFocus("code")
    }
  })
  const { isSubmitting } = useFormState({ control: form.control })
  async function send() {
    if (!isSubmitting) {
      await submit()
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <ActionForm
        form={form}
        onSubmit={(event) => {
          event?.preventDefault()
          void send()
        }}
        label={t("verifyEmail.submit")}
        layout="auth"
      >
        <CodeField name="code" label={t("fields.verificationCode")} onComplete={() => void send()} />
      </ActionForm>
      <ResendCode />
    </div>
  )
}

function ResendCode() {
  const t = useTranslations("auth.verifyEmail")
  const [wait, setWait] = useState(cooldown)
  const [sent, setSent] = useState(false)
  const resend = useAction("auth.resendCode", {
    onSuccess: () => {
      setWait(cooldown)
      setSent(true)
    }
  })
  useInterval(() => setWait((seconds) => Math.max(0, seconds - 1)), 1000, { autoInvoke: true })
  return (
    <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
      <p>
        {t("didntGetIt")}{" "}
        <Button
          variant="link"
          className="h-auto p-0 font-medium text-foreground"
          disabled={wait > 0 || resend.pending}
          onClick={() => {
            setSent(false)
            void resend.run()
          }}
        >
          {wait > 0 ? t("sendAgainIn", { seconds: wait }) : t("sendNewCode")}
        </Button>
      </p>
      <output aria-live="polite" className="min-h-5 text-xs">
        {resend.error || (sent && t("newCodeSent"))}
      </output>
    </div>
  )
}
