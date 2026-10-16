import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { pageResult } from "@/server/page-result"
import { reviewImportPage } from "@/server/review-import-page"
export const readReviewImport = createServerFn()
  .validator(z.object({ id: z.string().max(128) }))
  .handler(({ data }) => pageResult(() => reviewImportPage(data)))
