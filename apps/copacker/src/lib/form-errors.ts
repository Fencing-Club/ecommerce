import type { z } from "zod"

// The shared @repo/aisle schemas carry developer-facing defaults; this maps them to customer-facing field messages.
// Messages written on a schema (for example "Choose a freight forwarder") still take precedence.
export const formErrorMap: z.core.$ZodErrorMap = (issue) => {
  if (issue.input === "") {
    return "This field is required"
  }
  switch (issue.code) {
    case "invalid_type":
      return issue.expected === "number" ? "Enter a number" : "This field is required"
    case "too_small":
      if (issue.origin === "string") {
        return Number(issue.minimum) <= 1 ? "This field is required" : `Enter at least ${issue.minimum} characters`
      }
      if (issue.origin === "array") {
        return Number(issue.minimum) <= 1 ? "Add at least one" : `Add at least ${issue.minimum}`
      }
      return issue.inclusive ? `Enter ${issue.minimum} or more` : `Enter a number greater than ${issue.minimum}`
    case "too_big":
      if (issue.origin === "string") {
        return `Use ${issue.maximum} characters or fewer`
      }
      if (issue.origin === "array") {
        return `Use ${issue.maximum} or fewer`
      }
      return `Enter ${issue.maximum} or less`
    case "invalid_format":
      if (issue.format === "email") {
        return "Enter an email address"
      }
      if (issue.format === "date") {
        return "Enter a date"
      }
      if (issue.format === "uuid") {
        return "Choose an option"
      }
      return "Check the format"
    case "not_multiple_of":
      return `Enter a multiple of ${issue.divisor}`
    case "invalid_value":
    case "invalid_union":
      return "Choose an option"
    default:
      return undefined
  }
}
