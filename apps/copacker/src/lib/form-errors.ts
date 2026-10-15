import { createTranslator, type MessageKeys, type NestedKeyOf } from "use-intl"
import type { z } from "zod"
import type { Messages } from "@/i18n/messages"
import validation from "../../messages/en/validation.json"

// A generic validation message by its key under "validation", with its values. useTranslations("validation") and
// getTranslations("validation") are both one.
export type ValidationTranslator = (key: keyof typeof validation, values?: Record<string, number>) => string

// The shared @repo/aisle schemas carry developer-facing defaults; this maps them to customer-facing field messages in
// the translator's language. Messages written on a schema (for example "orders.builder.chooseForwarder") still take
// precedence, and form fields translate them.
export function formErrorMapFor(t: ValidationTranslator): z.core.$ZodErrorMap {
  return (issue) => {
    if (issue.input === "") {
      return t("required")
    }
    switch (issue.code) {
      case "invalid_type":
        return issue.expected === "number" ? t("number") : t("required")
      case "too_small": {
        const minimum = Number(issue.minimum)
        if (issue.origin === "string") {
          return minimum <= 1 ? t("required") : t("minLength", { minimum })
        }
        if (issue.origin === "array") {
          return minimum <= 1 ? t("addOne") : t("minItems", { minimum })
        }
        return issue.inclusive ? t("atLeast", { minimum }) : t("greaterThan", { minimum })
      }
      case "too_big": {
        const maximum = Number(issue.maximum)
        if (issue.origin === "string") {
          return t("maxLength", { maximum })
        }
        if (issue.origin === "array") {
          return t("maxItems", { maximum })
        }
        return t("atMost", { maximum })
      }
      case "invalid_format":
        if (issue.format === "email") {
          return t("email")
        }
        if (issue.format === "date") {
          return t("date")
        }
        if (issue.format === "uuid") {
          return t("chooseOption")
        }
        return t("format")
      case "not_multiple_of":
        return t("multipleOf", { divisor: Number(issue.divisor) })
      case "invalid_value":
      case "invalid_union":
        return t("chooseOption")
      default:
        return undefined
    }
  }
}

// The messages in English, for code without a translator. Client forms use useFormErrorMap() from
// "@/hooks/use-error-text" instead, which speaks the person's language.
export const formErrorMap = formErrorMapFor(
  createTranslator({ locale: "en", messages: { validation }, namespace: "validation" })
)

// Any message's full key, such as "orders.builder.chooseSupplier".
type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>

// Whether a message, such as one written on a zod schema, is the full key of a message rather than text to show as
// it is.
export function isMessageKey(messages: unknown, message: string): message is MessageKey {
  let node = messages
  for (const part of message.split(".")) {
    if (typeof node !== "object" || node === null || !Object.hasOwn(node, part)) {
      return false
    }
    node = Reflect.get(node, part)
  }
  return typeof node === "string"
}
