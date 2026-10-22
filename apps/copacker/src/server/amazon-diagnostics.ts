import { ProviderError, ReportProcessingError, ReportDeferredError } from "@repo/copacker-marketplaces/amazon"
import { FbmReturnsError } from "@repo/copacker-marketplaces/fbm-returns"
import { z } from "zod"

// Only schema-owned field names and fixed error categories. Never provider text, row values, URLs or IDs.
const fields = new Set([
  "periodDay",
  "currency",
  "amount",
  "quantity",
  "volume",
  "rate",
  "occurredAt",
  "orderId",
  "sku",
  "labelCost",
  "refundedAmount",
  "recoveryAmount",
  "approvedAt",
  "reimbursementId",
  "amountPerUnit",
  "amountTotal",
  "quantityCash",
  "quantityInventory",
  "quantityTotal",
  "shipmentId",
  "shipmentStatus",
  "updatedAt",
  "shipmentSkuQuantities",
  "expectedQuantity",
  "receivedQuantity",
  "unitOfMeasurement",
  "shipments",
  "createdAt"
])
const operations = new Set(["createReport", "getReports", "getReport", "getReportDocument", "downloadReport"])
export function amazonFailureDetails(error: unknown) {
  const validationError = error instanceof FbmReturnsError ? error.validation : error
  return {
    locallyDeferred: error instanceof ReportDeferredError ? true : undefined,
    retryAt: error instanceof ReportDeferredError ? error.retryAt.toISOString() : undefined,
    dateFormat: error instanceof FbmReturnsError ? error.dateFormat : undefined,
    httpStatus: error instanceof ProviderError ? error.status : undefined,
    operation:
      error instanceof ProviderError && error.operation && operations.has(error.operation)
        ? error.operation
        : undefined,
    processingStatus: error instanceof ReportProcessingError ? "FATAL" : undefined,
    hasDiagnosticDocument: error instanceof ReportProcessingError ? error.hasDiagnosticDocument : undefined,
    validation:
      validationError instanceof z.ZodError
        ? validationError.issues.slice(0, 10).map((issue) => ({
            code: issue.code,
            field: issue.path.filter((part) => typeof part === "string" && fields.has(part)).join(".") || "other"
          }))
        : undefined,
    structure:
      error instanceof Error &&
      [
        "Invalid quoted report field",
        "Unclosed report field",
        "Missing or duplicate report columns",
        "Incomplete report row"
      ].includes(error.message)
        ? error.message
        : undefined
  }
}
