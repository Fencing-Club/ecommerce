import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { profiles } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { locales } from "@/i18n/locales"
import { stores } from "@/lib/stores"
import { queueAmazonSubscription } from "@/server/amazon-notifications"
import { requireAdmin } from "@/server/authorization"
import { connectAmazonSelfAuthorized, disconnect } from "@/server/connections"
import { contactSchema, createContact, deleteContact, updateContact } from "@/server/contacts"
import { startFirstSync } from "@/server/first-sync"
import { addMonthlyCost, removeMonthlyCost } from "@/server/monthly-costs"
import { saveProfile } from "@/server/profile"
import { saveSupplierProfile, supplierContactSchema } from "@/server/suppliers"
import type { Session } from "@/server/workspace-session"
import {
  excludedTagsSchema,
  restockDefaultsSchema,
  setExcludedShopifyTags,
  setRestockDefaults,
  setTimeZone,
  timeZoneSchema
} from "@/server/workspace-settings"
import { defineAction, fields, type Guard } from "./define"

// Settings: the person's own profile, and what admins keep for the workspace (its settings, addresses, store
// connections and monthly costs). See permissions.md.
const admins: Guard = { admin: true }
// A setting only one kind of workspace has: its admins, and another kind is told which workspace it needs.
const adminsOf = (kind: "buyer" | "supplier") => (s: Session) => {
  requireAdmin(s)
  if (s.org.kind !== kind) {
    throw new LocalizedError(kind === "buyer" ? "buyerWorkspaceRequired" : "supplierWorkspaceRequired")
  }
}
const record = z.object({ id: z.uuid() })
const ok = { ok: true } as const

export const settingsActions = {
  "profile.update": defineAction({ input: fields, run: (data, s) => saveProfile(s, data) }),
  // An empty choice goes back to the computer's language.
  "profile.locale": defineAction({
    input: z.object({ locale: z.union([z.literal(""), z.enum(locales)]) }),
    run: async ({ locale }, s) => {
      await db()
        .update(profiles)
        .set({ locale: locale || null })
        .where(eq(profiles.userId, s.user.id))
      return ok
    }
  }),
  "workspace.timeZone": defineAction({
    guard: admins,
    input: timeZoneSchema,
    run: async ({ timeZone }, s) => {
      await setTimeZone(s.org.id, timeZone)
      return ok
    }
  }),
  "workspace.restock": defineAction({
    guard: admins,
    input: restockDefaultsSchema,
    run: async (input, s) => {
      await setRestockDefaults(s.org.id, input)
      return ok
    }
  }),
  "workspace.excludedShopifyTags": defineAction({
    guard: adminsOf("buyer"),
    input: excludedTagsSchema,
    run: async ({ tags }, s) => {
      await setExcludedShopifyTags(s.org.id, tags)
      return ok
    }
  }),
  // The supplier's own contact details, which its buyers see.
  "supplier.profile": defineAction({
    guard: adminsOf("supplier"),
    input: supplierContactSchema,
    run: async (input, s) => {
      await saveSupplierProfile(s.org.id, input)
      return ok
    }
  }),
  "contact.create": defineAction({
    guard: admins,
    input: contactSchema,
    run: async (contact, s) => {
      await createContact(s.org, contact)
      return ok
    }
  }),
  "contact.update": defineAction({
    guard: admins,
    input: contactSchema.extend({ id: z.uuid() }),
    run: async ({ id, ...contact }, s) => {
      await updateContact(s.org, id, contact)
      return ok
    }
  }),
  "contact.delete": defineAction({
    guard: admins,
    input: record,
    run: async ({ id }, s) => {
      await deleteContact(s.org.id, id)
      return ok
    }
  }),
  // Connects a self-authorized Amazon seller, then subscribes it to notifications and starts its first sync.
  "connection.amazonSelfAuthorized": defineAction({
    guard: { admin: true, kind: "buyer" },
    input: fields,
    run: async (data, s) => {
      const connected = await connectAmazonSelfAuthorized(s.org.id, data)
      await queueAmazonSubscription(s.org.id, randomUUID())
      await startFirstSync(s.org, "amazon")
      return { ok: true, ...connected }
    }
  }),
  "connection.delete": defineAction({
    guard: { admin: true, kind: "buyer" },
    input: z.object({ provider: z.enum(stores) }),
    run: async ({ provider }, s) => ({ ok: true, ...(await disconnect(s.org.id, provider)) })
  }),
  // Costs paid monthly that no platform reports, which feed the Overview's profit.
  "monthlyCost.create": defineAction({ guard: admins, input: fields, run: (data, s) => addMonthlyCost(s, data) }),
  "monthlyCost.delete": defineAction({
    guard: admins,
    input: record,
    run: async ({ id }, s) => {
      await removeMonthlyCost(s, id)
      return ok
    }
  })
}
