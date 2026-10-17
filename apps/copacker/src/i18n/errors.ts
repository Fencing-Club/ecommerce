import { createTranslator } from "use-intl"
import { english, type Messages } from "./messages"

export type ErrorKey = keyof Messages["errors"] & string
type Values = Record<string, string | number>

const inEnglish = createTranslator({ locale: "en", messages: english, namespace: "errors" })

// A failure to show the person, as a key under the "errors" messages and its values. The action and API routes
// translate it into the request's language; the Error's message is the English text, for logs and tests.
export class LocalizedError extends Error {
  constructor(
    readonly key: ErrorKey,
    readonly values: Values = {}
  ) {
    super(inEnglish(key, values))
  }
}

// A role or page grant does not allow this operation. Kept independent of request-local translation helpers.
export class AccessError extends LocalizedError {}

// Domain lookups report absence without choosing a framework's response or serializing private record details.
export class NotFoundError extends Error {
  constructor() {
    super("not found")
  }
}
