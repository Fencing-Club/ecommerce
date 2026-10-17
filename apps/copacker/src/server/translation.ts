import { createTranslator, type NamespaceKeys, type NestedKeyOf } from "use-intl"
import type { Messages } from "@/i18n/messages"
import { localization } from "@/server/localization"

// Server-rendered DTOs use the same request catalog as the browser provider and background domain operations.
export async function serverTranslator<Namespace extends NamespaceKeys<Messages, NestedKeyOf<Messages>> = never>(
  namespace?: Namespace
) {
  return createTranslator({ ...(await localization()), namespace })
}
