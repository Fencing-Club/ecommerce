import { z } from "zod"

export const previewSettings = z.object({
  PR_NUMBER: z.string().regex(/^[1-9]\d*$/),
  NEON_PROJECT_ID: z.string().min(1),
  NEON_STAGING_BRANCH_ID: z.string().startsWith("br-"),
  NEON_DATABASE_NAME: z.string().min(1),
  NEON_ROLE_NAME: z.string().min(1),
  RAILWAY_PROJECT_ID: z.string().uuid(),
  RAILWAY_PREVIEW_ENVIRONMENT_ID: z.string().uuid()
})

// Deliberately do not propagate commerce, queues, email, webhook, or production credentials into previews.
export const previewSource = z.object({
  WORKOS_API_KEY: z.string().min(1),
  WORKOS_CLIENT_ID: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  S3_ENDPOINT: z.url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1)
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
