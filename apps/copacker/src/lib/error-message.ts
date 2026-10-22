// What went wrong with a request, to show the person: the server's message, or `fallback` when there isn't one. Only
// the API's own `error` text is shown; any other error body, such as a sign-in page's HTML, gets the fallback. The
// English defaults are for code without a translator; client components use useErrorMessage() from
// "@/hooks/use-error-text", which passes both in the person's language. It lives apart from "@/lib/api", so a page
// that shows form errors doesn't download the data cache with it.
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Try again.",
  offline = "Couldn't reach Copacker. Check your connection and try again."
) {
  if (typeof error === "object" && error !== null) {
    if (
      "data" in error &&
      typeof error.data === "object" &&
      error.data !== null &&
      "error" in error.data &&
      typeof error.data.error === "string"
    ) {
      return error.data.error
    }
    if ("status" in error && error.status === "FETCH_ERROR") {
      return offline
    }
    if (error instanceof Error) {
      return error.message
    }
  }
  return fallback
}
