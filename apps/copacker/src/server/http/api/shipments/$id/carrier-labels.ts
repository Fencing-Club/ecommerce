import { LocalizedError } from "@/i18n/errors"
import { session } from "@/server/auth"
import { maxCarrierLabelBytes, saveCarrierLabels } from "@/server/carrier-labels"
import { errorResponse, failureMessage, failureStatus } from "@/server/errors"
import { isAppOrigin } from "@/server/security"

// Saves the buyer's carrier labels from the Upload carrier labels dialog: the files, and which page labels each carton.
export async function POST(request: Request, context: { params: { id: string } }) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  const s = await session()
  try {
    if (Number(request.headers.get("content-length") ?? 0) > maxCarrierLabelBytes + 1024 * 1024) {
      throw new LocalizedError("fileTooLarge")
    }
    return Response.json(await saveCarrierLabels(s, (await context.params).id, await request.formData()))
  } catch (error) {
    return Response.json(
      { error: await failureMessage(error, "documentUploadFailed") },
      { status: failureStatus(error) }
    )
  }
}
