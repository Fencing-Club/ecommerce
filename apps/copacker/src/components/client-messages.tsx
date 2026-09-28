import type { AbstractIntlMessages, NamespaceKeys, NestedKeyOf } from "next-intl"
import { NextIntlClientProvider } from "next-intl"
import { getMessages } from "next-intl/server"
import type { Messages } from "@/i18n/messages"

// A namespace or nested part of the messages, such as "marketing.planner".
type Namespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>

// The parts of the messages at `namespaces`, in their places, for a page that needs a few of them rather than all.
export function pickMessages(messages: AbstractIntlMessages, namespaces: readonly Namespace[]) {
  const picked: AbstractIntlMessages = {}
  for (const namespace of namespaces) {
    const keys = namespace.split(".")
    const last = keys.pop()
    let from: AbstractIntlMessages | string | undefined = messages
    let to = picked
    for (const key of keys) {
      from = typeof from === "object" ? from[key] : undefined
      const existing = to[key]
      const child = typeof existing === "object" ? existing : {}
      to[key] = child
      to = child
    }
    const value = typeof from === "object" && last ? from[last] : undefined
    if (last && value !== undefined) {
      to[last] = value
    }
  }
  return picked
}

// Gives the client components inside only the messages at `namespaces`. The messages client components read travel in
// the page's HTML, so a page that uses a few of them carries just those, not every area's.
export async function ClientMessages({
  namespaces,
  children
}: {
  namespaces: readonly Namespace[]
  children: React.ReactNode
}) {
  const messages = await getMessages()
  return <NextIntlClientProvider messages={pickMessages(messages, namespaces)}>{children}</NextIntlClientProvider>
}
