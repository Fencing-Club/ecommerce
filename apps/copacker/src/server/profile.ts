import { eq } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { profiles, supplierProfiles } from "@/db/schema"
import { personSchema, websiteSchema } from "@/lib/onboarding"
import type { Session } from "./auth"

// The profile the portal asks for before anything else: the person and their company, and for a buyer's owner, the
// workspace's website.
export const profileInputSchema = personSchema.extend({
  company: z.string().trim().min(1, "Enter your company").max(120),
  website: websiteSchema.optional()
})

type ProfileValues = Omit<z.output<typeof profileInputSchema>, "website">

// Saves a person's own name, position and company, which their comments show from now on.
export async function writeProfile(tx: Transaction, userId: string, values: ProfileValues) {
  await tx
    .insert(profiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: profiles.userId, set: { ...values, updatedAt: new Date() } })
}

export async function saveProfile(s: Pick<Session, "user" | "org" | "role">, raw: unknown) {
  const { website, ...input } = profileInputSchema.parse(raw)
  // The website is the workspace's, which only its owner changes.
  if (website !== undefined && (s.org.kind !== "buyer" || s.role !== "owner")) {
    throw new Error("Only the workspace owner can change its website")
  }
  await db().transaction(async (tx) => {
    await writeProfile(tx, s.user.id, input)
    if (website !== undefined) {
      await tx
        .insert(supplierProfiles)
        .values({ orgId: s.org.id, website: website || null })
        .onConflictDoUpdate({
          target: supplierProfiles.orgId,
          set: { website: website || null, updatedAt: new Date() }
        })
    }
  })
  return { ok: true }
}

// The person's saved profile, and whether it has everything the portal asks for before anything else.
export async function ownProfile(userId: string) {
  const [row] = await db().select().from(profiles).where(eq(profiles.userId, userId))
  return { profile: row ?? null, complete: !!row && profileInputSchema.safeParse(row).success }
}
