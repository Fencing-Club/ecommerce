import { z } from "zod"

export const previewSettings = z.object({
  PR_NUMBER: z.string().regex(/^[1-9]\d*$/),
  NEON_PROJECT_ID: z.string().regex(/^[a-z0-9-]+$/),
  NEON_STAGING_BRANCH_ID: z.string().startsWith("br-"),
  NEON_DATABASE_NAME: z.string().min(1),
  NEON_ROLE_NAME: z.string().min(1)
})

export const neonBranch = z.object({
  id: z.string(),
  name: z.string(),
  parent_id: z.string().optional(),
  default: z.boolean(),
  protected: z.boolean().optional()
})

export function assertPreviewBranch(branch: z.infer<typeof neonBranch>, name: string, parentId: string) {
  if (branch.name !== name || branch.parent_id !== parentId || branch.default || branch.protected) {
    throw new Error("Refusing to modify a branch that is not this PR's unprotected staging child")
  }
}
