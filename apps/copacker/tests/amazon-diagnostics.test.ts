import { ProviderError, ReportProcessingError, ReportDeferredError } from "@repo/aisle/amazon"
import { parseFbmReturns } from "@repo/aisle/fbm-returns"
import { expect, it } from "vitest"
import { z } from "zod"
import { amazonFailureDetails } from "../src/server/amazon-diagnostics"
it("logs only allowlisted failure metadata", () => {
  const parsed = z
    .object({ occurredAt: z.iso.datetime(), privateCustomerField: z.number() })
    .safeParse({ occurredAt: "secret", privateCustomerField: "private" })
  if (parsed.success) {
    throw new Error("Expected invalid fixture")
  }
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

it("retains only the shape of an unsupported return date", () => {
  let failure: unknown
  try {
    parseFbmReturns(
      "Order ID\tReturn request date\tAmazon RMA ID\tMerchant SKU\tReturn quantity\tReturn Reason\tReturn request status\nPRIVATE_ORDER\t09/17/2026\tPRIVATE_RMA\tPRIVATE_SKU\t1\tPRIVATE_REASON\tCLOSED"
    )
  } catch (error) {
    failure = error
  }
  const details = amazonFailureDetails(failure)
  expect(details.dateFormat).toBe("00/00/0000")
  expect(details.validation).toEqual([{ code: "invalid_format", field: "occurredAt" }])
  expect(JSON.stringify(details)).not.toMatch(/PRIVATE|2026|17/)
})

it("distinguishes a local quota deferral from an Amazon HTTP failure", () => {
  const details = amazonFailureDetails(new ReportDeferredError(new Date("2026-10-19T02:00:00Z")))
  expect(details).toMatchObject({ locallyDeferred: true, retryAt: "2026-10-19T02:00:00.000Z" })
  expect(details.httpStatus).toBeUndefined()
})
