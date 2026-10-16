// Authentication changes the session. Load a new document to discard the previous session's route and API caches.
// The server also returns WorkOS SSO URLs, which need a document navigation rather than an internal router push.
export function finishSignIn(href: string) {
  window.location.assign(href)
}
