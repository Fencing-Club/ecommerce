import { ProviderError, ReportProcessingError } from "@repo/aisle/amazon"
import { expect, it } from "vitest"
import { z } from "zod"
import { amazonFailureDetails } from "../src/server/amazon-diagnostics"
it("logs only allowlisted failure metadata", () => {
  const parsed = z
    .object({ occurredAt: z.iso.datetime(), privateCustomerField: z.number() })
    .safeParse({ occurredAt: "secret", privateCustomerField: "private" })
  if (parsed.success) {throw new Error("Expected invalid fixture")}
  const details = amazonFailureDetails(parsed.error)
  expect(details.validation).toEqual([
    { code: "invalid_format", field: "occurredAt" },
    { code: "invalid_type", field: "other" }
  ])
  expect(JSON.stringify(details)).not.toMatch(/secret|private/)
  expect(
    amazonFailureDetails(new ProviderError(429, "secret-id", "private response", 60000, "getReportDocument"))
  ).toMatchObject({ httpStatus: 429, operation: "getReportDocument" })
  expect(amazonFailureDetails(new ReportProcessingError(true))).toMatchObject({
    processingStatus: "FATAL",
    hasDiagnosticDocument: true
  })
})
