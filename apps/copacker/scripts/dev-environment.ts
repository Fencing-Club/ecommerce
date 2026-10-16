/** App-specific settings shared by the domain config, workers, builds, and Playwright. */
export function localAppEnvironment(url: string) {
  return {
    APP_URL: url,
    APP_ALIAS_URLS: "",
    WORKOS_REDIRECT_URI: `${url}/callback`,
    WORKOS_COOKIE_DOMAIN: "",
    COPACKER_LOCAL: "1"
  }
}
