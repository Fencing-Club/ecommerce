import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { realpathSync } from "node:fs"
import path from "node:path"

export const developmentDomain = "local.copacker.ai"

// Paths, not branches, identify servers: switching branches must not change an open browser's origin.
export function worktreeName(root: string, isMain: boolean) {
  if (isMain) {
    return "main"
  }
  const canonical = root.replaceAll("\\", "/").replace(/\/$/, "")
  const normalized = /^[a-z]:/i.test(canonical) ? canonical.toLowerCase() : canonical
  const slug = normalized
    .split("/")
    .at(-1)
    ?.replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase()
  const label = (slug || "worktree").slice(0, 48).replace(/^-+|-+$/g, "") || "worktree"
  return `${label}-${createHash("sha256").update(normalized).digest("hex").slice(0, 8)}`
}

export function developmentEnvironment() {
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()
  const root = realpathSync(git("rev-parse", "--show-toplevel"))
  const common = realpathSync(git("rev-parse", "--path-format=absolute", "--git-common-dir"))
  const name = worktreeName(root, common === path.join(root, ".git"))
  return {
    root,
    name,
    app: developmentUrl(name, "app"),
    stories: developmentUrl(name, "stories"),
    e2e: developmentUrl(name, "e2e")
  }
}

export function developmentUrl(name: string, service: "app" | "stories" | "e2e") {
  return `https://${name}${service === "app" ? "" : `.${service}`}.${developmentDomain}`
}

export function localAppEnvironment(url: string) {
  return {
    APP_URL: url,
    APP_ALIAS_URLS: "",
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: `${url}/callback`,
    WORKOS_COOKIE_DOMAIN: "",
    COPACKER_LOCAL: "1"
  }
}
