import { objectHasOwn } from "ts-extras"
import { z } from "zod"
import type { ApiTag } from "@/lib/api-tags"
import { fields } from "./define"
import { gettingStartedActions } from "./getting-started"
import { orderActions } from "./orders"
import { partnerActions } from "./partners"
import { settingsActions } from "./settings"
import { shipmentActions } from "./shipments"
import { signInActions } from "./sign-in"
import { teamActions } from "./team"

// Every /api/action command by name. docs/api-contract.md lists them with their data and checks.
export const actions = {
  ...signInActions,
  ...gettingStartedActions,
  ...teamActions,
  ...settingsActions,
  ...partnerActions,
  ...orderActions,
  ...shipmentActions
} satisfies Record<
  string,
  { input: z.ZodType; execute: (data: unknown) => Promise<unknown>; invalidates: readonly ApiTag[] }
>

type Actions = typeof actions
export type ActionName = keyof Actions
// The data an action takes, and what it answers with.
export type ActionInput<K extends ActionName> = z.input<Actions[K]["input"]>
export type ActionOutput<K extends ActionName> = Awaited<ReturnType<Actions[K]["execute"]>>

// A request to /api/action: an action by name, and its data.
export const actionCall = z.object({
  action: z.custom<ActionName>((name) => typeof name === "string" && objectHasOwn(actions, name), "Unknown action"),
  data: fields
})
