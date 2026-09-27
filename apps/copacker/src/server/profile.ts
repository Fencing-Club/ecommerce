import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { profiles } from "@/db/schema"
import type { Session } from "./auth"

export const profileInputSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(60),
  lastName: z.string().trim().min(1, "Enter your last name").max(60),
  position: z.string().trim().min(1, "Choose your position").max(100),
  company: z.string().trim().min(1, "Enter your company").max(120)
})

// Saves the person's own name, position and company, which their comments show from now on.
export async function saveProfile(s: Pick<Session, "user">, raw: unknown) {
  const input = profileInputSchema.parse(raw)
  await db()
    .insert(profiles)
    .values({ userId: s.user.id, ...input })
    .onConflictDoUpdate({ target: profiles.userId, set: { ...input, updatedAt: new Date() } })
  return { ok: true }
}

// The person's saved profile, and whether it has everything the portal asks for before anything else.
export async function ownProfile(userId: string) {
  const [row] = await db().select().from(profiles).where(eq(profiles.userId, userId))
  return { profile: row ?? null, complete: !!row && profileInputSchema.safeParse(row).success }
}
