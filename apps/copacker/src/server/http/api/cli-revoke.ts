import { cliTokenResponse } from "@/server/cli-http"
export const POST = (request: Request) => cliTokenResponse(request, true)
