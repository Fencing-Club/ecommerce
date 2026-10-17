import { z } from "zod"

export const previewNumber = z.string().regex(/^[1-9]\d*$/)

export function previewResources(input: string) {
  const number = previewNumber.parse(input)
  const prefix = `previews/pr-${number}/`
  return {
    app: `copacker-pr-${number}`,
    stories: `copacker-stories-pr-${number}`,
    queue: `copacker-jobs-pr-${number}`,
    prefix,
    documentsPrefix: `${prefix}app/`
  }
}

export const previewSettings = z.object({
  PR_NUMBER: previewNumber,
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
