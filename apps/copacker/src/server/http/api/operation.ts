import { operationResponse } from "@/server/operations"
export function POST(request: Request, { params }: { params: { operation: string } }) {
  return operationResponse(request, params.operation)
}
