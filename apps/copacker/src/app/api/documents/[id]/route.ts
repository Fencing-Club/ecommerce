import { forbidden } from "next/navigation"
import { AccessError } from "@/i18n/errors"
import { session } from "@/server/auth"
import { downloadDocument } from "@/server/document-download"
import { withRequest } from "@/server/next-request"

export const GET = withRequest(async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return await downloadDocument(await session(), (await context.params).id)
  } catch (error) {
    if (error instanceof AccessError) {
      forbidden()
    }
    throw error
  }
})
