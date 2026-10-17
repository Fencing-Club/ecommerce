import { AccessError } from "@/i18n/errors"
import { session } from "@/server/auth"
import { downloadDocument } from "@/server/document-download"

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    return await downloadDocument(await session(), (await context.params).id)
  } catch (error) {
    if (error instanceof AccessError) {
      throw new AccessError("forbidden")
    }
    throw error
  }
}
