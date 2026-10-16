import { isNotFound, isRedirect } from "@tanstack/react-router"
import { createTranslator, type MessageKeys, type NestedKeyOf } from "use-intl"
import { z } from "zod"
import type { ErrorKey } from "@/i18n/errors"
import { AccessError, LocalizedError } from "@/i18n/errors"
import { english, type Messages } from "@/i18n/messages"
import { localization } from "@/server/localization"

type Values = Record<string, string | number>

// The saved authorization can no longer be used; only reconnecting in Settings fixes it.
export class ReconnectRequiredError extends Error {}

// A failure to show the person, with the HTTP status a route answers it with.
export class StatusError extends LocalizedError {
  constructor(
    key: ErrorKey,
    readonly status: number,
    values?: Values
  ) {
    super(key, values)
  }
}

// The status for a request that failed: 403 when access was refused, and otherwise 400.
export function failureStatus(error: unknown) {
  return error instanceof AccessError ? 403 : 400
}

type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>

// The request's "errors" messages, and all messages, or English outside a request (the worker, and tests that call
// routes directly).
export async function errorText(): Promise<(key: ErrorKey, values?: Values) => string> {
  return createTranslator({ ...(await localization()), namespace: "errors" })
}
async function messagesText(): Promise<(key: MessageKey) => string> {
  return createTranslator(await localization())
}

// Whether a message, such as a zod issue's, is the full key of a message ("orders.builder.chooseSupplier") rather than
// text to show as it is. English has every key, so it answers for every language.
function isMessageKey(message: string): message is MessageKey {
  let node: unknown = english
  for (const part of message.split(".")) {
    node = typeof node === "object" && node !== null ? Object.getOwnPropertyDescriptor(node, part)?.value : undefined
  }
  return typeof node === "string"
}

// The text of a failure in the request's language: a LocalizedError's message, each zod issue (translated when its
// message is a key), another error's own message, or the fallback. A failed database query shows a generic message.
export async function failureMessage(error: unknown, fallback: ErrorKey = "requestFailed") {
  if (isRedirect(error) || isNotFound(error)) {
    throw error
  }
  const t = await errorText()
  if (error instanceof LocalizedError) {
    return t(error.key, error.values)
  }
  if (error instanceof z.ZodError) {
    const messages = await messagesText()
    return error.issues
      .map((issue) =>
        isMessageKey(issue.message) ? messages(issue.message) : `${issue.path.join(".")}: ${issue.message}`
      )
      .join("\n")
  }
  if (error instanceof Error && error.message.startsWith("Failed query:")) {
    return t("saveFailed")
  }
  return error instanceof Error ? error.message : t(fallback)
}

// A route's JSON failure: { error } in the request's language.
export async function errorResponse(key: ErrorKey, status: number, headers?: HeadersInit) {
  const t = await errorText()
  return Response.json({ error: t(key) }, { status, headers })
}

// A download's failure as plain text in the request's language, which the browser shows in place of the file.
export async function errorTextResponse(key: ErrorKey, status: number) {
  const t = await errorText()
  return new Response(t(key), { status })
}
