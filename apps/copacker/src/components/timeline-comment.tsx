import { useController } from "react-hook-form"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { Textarea } from "@/components/ui/textarea"
import { useActionForm } from "@/hooks/useActionForm"

const schema = z.object({ message: z.string().trim().min(1, "orders.timeline.comment.required").max(4000) })

// The comment box at the top of a PO's timeline, like Shopify's.
export function TimelineComment({ orderId }: { orderId: string }) {
  const t = useTranslations("orders.timeline.comment")
  const { form, submit } = useActionForm({
    schema,
    action: "order.comment",
    defaultValues: { message: "" },
    toPayload: (values) => ({ orderId, message: values.message })
  })
  const { field } = useController({ control: form.control, name: "message" })
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <div className="rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Textarea
          {...field}
          aria-label={t("label")}
          placeholder={t("placeholder")}
          className="min-h-16 resize-none border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              void submit()
            }
          }}
        />
        <div className="flex justify-end border-t bg-muted/50 px-2 py-1.5">
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
      <FormError message={form.formState.errors.root?.server?.message ?? form.formState.errors.message?.message} />
    </form>
  )
}
