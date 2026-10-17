import { createTranslator, type MessageKeys, type NestedKeyOf } from "use-intl"
import { english, type Messages } from "./messages"

export type ServerKey = MessageKeys<Messages["server"], NestedKeyOf<Messages["server"]>>
// Business rules accept translated text explicitly and can also run in the browser or a background job.
export type ServerText = (key: ServerKey, values?: Record<string, string | number>) => string

export const serverTextInEnglish: ServerText = createTranslator({
  locale: "en",
  messages: english,
  namespace: "server"
})
