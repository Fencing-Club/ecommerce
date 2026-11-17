import {
  AlertAction,
  Button,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from "@buildkitgg/shadcn"
import { Lock, Users, X } from "lucide-react"
import { useId } from "react"
import { useController } from "react-hook-form"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { useActionForm } from "@/hooks/use-action-form"
import { cn } from "@/lib/utils"

export type PostedComment = { message: string; visibility: "internal" | "shared" }

const schema = z.object({
  message: z.string().trim().min(1, "orders.timeline.comment.required").max(4000),
  visibility: z.enum(["internal", "shared"])
})

// The comment box at the top of a PO's timeline, like Shopify's. It's opaque, so the timeline's line can start behind
// it, and a failure shows inside it, between what was written and the Post button, until it's dismissed or the comment
// is posted again.
export function TimelineComment({
  orderId,
  counterparty = "supplier",
  onPosted
}: {
  orderId: string
  counterparty?: "supplier" | "customer"
  onPosted?: (comment: PostedComment) => void
}) {
  const hintId = useId(),
    errorId = useId()
  const t = useTranslations("orders.timeline.comment")
  const { form, submit } = useActionForm({
    schema,
    action: "order.comment",
    defaultValues: { message: "", visibility: "internal" },
    toPayload: (values) => ({ orderId, ...values }),
    onSuccess: (_, comment) => onPosted?.(comment)
  })
  const { field } = useController({ control: form.control, name: "message" })
  const { field: visibility } = useController({ control: form.control, name: "visibility" })
  const sharedHint = counterparty === "supplier" ? "supplierHint" : "customerHint"
  const error = form.formState.errors.root?.server?.message ?? form.formState.errors.message?.message
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border bg-background focus-within:ring-3 focus-within:ring-ring/50",
          error ? "border-destructive/30" : "border-input focus-within:border-ring"
        )}
      >
        <Textarea
          {...field}
          aria-label={t("label")}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          placeholder={t("placeholder")}
          className="min-h-18 resize-none rounded-none border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              if (field.value.trim() && !form.formState.isSubmitting) {
                void submit()
              }
            }
          }}
        />
        <FormError
          id={errorId}
          message={error}
          className="rounded-none border-0 border-t border-destructive/30 bg-destructive/5 dark:bg-destructive/10 has-data-[slot=alert-action]:pe-10 *:data-[slot=alert-description]:text-meta/5"
          action={
            <AlertAction className="top-1.5 end-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("dismissError")}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  form.clearErrors()
                  form.setFocus("message")
                }}
              >
                <X aria-hidden />
              </Button>
            </AlertAction>
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/50 px-2 py-1.5">
          <Select
            value={visibility.value}
            onValueChange={(value) => {
              if (value === "internal" || value === "shared") {
                visibility.onChange(value)
              }
            }}
          >
            <SelectTrigger
              aria-label={t("visibility")}
              className="max-w-full gap-1.5 border-0 bg-transparent px-0 text-xs text-muted-foreground shadow-none"
              size="sm"
            >
              {visibility.value === "internal" ? <Lock className="size-3.5" /> : <Users className="size-3.5" />}
              <SelectValue>
                {visibility.value === "internal"
                  ? t("internal")
                  : t(counterparty === "supplier" ? "messageSupplier" : "messageCustomer")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false} className="w-auto">
              <SelectGroup>
                <SelectItem value="internal">{t("internal")}</SelectItem>
                <SelectItem value="shared">
                  {t(counterparty === "supplier" ? "messageSupplier" : "messageCustomer")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <SubmitButton
            type="submit"
            variant="outline"
            size="sm"
            pending={form.formState.isSubmitting}
            disabled={!field.value.trim()}
          >
            {t("post")}
          </SubmitButton>
        </div>
      </div>
      <p id={hintId} className="text-end text-xs text-muted-foreground">
        {t(visibility.value === "internal" ? "internalHint" : sharedHint)}
      </p>
    </form>
  )
}
