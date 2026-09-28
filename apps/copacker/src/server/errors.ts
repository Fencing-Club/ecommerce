// The saved authorization can no longer be used; only reconnecting in Settings fixes it.
export class ReconnectRequiredError extends Error {}

// The person's role or page access doesn't allow what they asked for.
export class AccessError extends Error {}

// The status for a request that failed: 403 when access was refused, and otherwise 400.
export function failureStatus(error: unknown) {
  return error instanceof AccessError ? 403 : 400
}
