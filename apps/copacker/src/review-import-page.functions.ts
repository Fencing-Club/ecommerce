import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { localizedPage } from "@/server/page-result"
import { reviewImportPage } from "@/server/review-import-page"
export const readReviewImport = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => localizedPage(() => reviewImportPage(data), "orders.review.title"))
