"use client"

import { useMessages, useTranslations } from "next-intl"
import { errorMessage } from "@/lib/error-message"
import { formErrorMapFor, isMessageKey } from "@/lib/form-errors"

// Shows a message in the person's language when it's the full key of one, such as "orders.builder.chooseSupplier"
// written on a zod schema, and any other text, such as a server's already translated error, as it is.
export function useMessageText() {
  const t = useTranslations()
  const messages = useMessages()
  return (message: string) => (isMessageKey(messages, message) ? t(message) : message)
}

// The generic field messages (required, too long) in the person's language, for zodResolver's `error` option.
export function useFormErrorMap() {
  return formErrorMapFor(useTranslations("validation"))
}

// errorMessage from "@/lib/api" with its fallbacks in the person's language. Pass a fallback of your own for a
// failure that says more, such as "Couldn't upload the file".
export function useErrorMessage() {
  const t = useTranslations("common.errors")
  return (error: unknown, fallback?: string) => errorMessage(error, fallback ?? t("generic"), t("offline"))
}
