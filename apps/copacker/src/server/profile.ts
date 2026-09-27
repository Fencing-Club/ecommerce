import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { profiles, supplierProfiles } from "@/db/schema"
import type { Session } from "./auth"

export const profileInputSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(60),
  lastName: z.string().trim().min(1, "Enter your last name").max(60),
  position: z.string().trim().min(1, "Choose your position").max(100),
  company: z.string().trim().min(1, "Enter your company").max(120),
  website: z
    .union([z.url({ protocol: /^https?$/, error: "Enter a full address, starting https://" }), z.literal("")])
    .optional()
})

// Saves the person's own name, position and company, which their comments show from now on.
export async function saveProfile(s: Pick<Session, "user" | "org" | "role">, raw: unknown) {
  const { website, ...input } = profileInputSchema.parse(raw)
  // The website is the workspace's, which only its owner changes.
  if (website !== undefined && (s.org.kind !== "buyer" || s.role !== "owner")) {
    throw new Error("Only the workspace owner can change its website")
  }
  await db().transaction(async (tx) => {
    await tx
      .insert(profiles)
      .values({ userId: s.user.id, ...input })
      .onConflictDoUpdate({ target: profiles.userId, set: { ...input, updatedAt: new Date() } })
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
