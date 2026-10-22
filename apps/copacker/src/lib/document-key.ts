import { arrayIncludes } from "ts-extras"

// Pages the document's own head names: the marketing site's, the legal pages, and setup, which have no loader.
export const documentHeadPages = ["/", "/contact", "/privacy", "/terms", "/setup"] as const

// Pages outside the portal, which load only the messages they use.
const publicPages = [
  ...documentHeadPages,
  "/unsubscribe",
  "/maintenance",
  "/login",
  "/cli/authorize",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/invite",
  "/onboarding",
  "/workspaces/new"
]

// What the document loader reads for a page: its own head for a page the document names, the public pages' messages
// for another page outside the portal, or the app's for the rest. A navigation between pages with the same key keeps
// what's loaded.
export function documentKey(pathname: string) {
  if (arrayIncludes(documentHeadPages, pathname)) {
    return pathname
  }
  return publicPages.includes(pathname) ? "public" : "app"
}
