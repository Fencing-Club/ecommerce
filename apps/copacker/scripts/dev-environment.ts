import { execFileSync } from "node:child_process"
import { realpathSync } from "node:fs"
import path from "node:path"

export const developmentDomain = "local.copacker.ai"
export const developmentProxyDomain = "copacker.ai"

// Paths, not branches, identify servers: switching branches must not change an open browser's origin.
export function worktreeName(root: string, isPrimary: boolean) {
  if (isPrimary) {
    return null
  }
  const canonical = root.replaceAll("\\", "/").replace(/\/$/, "")
  const normalized = /^[a-z]:/i.test(canonical) ? canonical.toLowerCase() : canonical
  const slug = normalized
    .split("/")
    .at(-1)
    ?.replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase()
  const label = (slug || "worktree").replace(/^-+|-+$/g, "") || "worktree"
  if (label.length > 63) {
    throw new Error("Worktree names must fit a 63-character DNS label. Use a shorter folder name.")
  }
  if (["stories", "e2e", "hooks"].includes(label)) {
    throw new Error(`Worktree name ${label} is reserved for a local service. Use a different folder name.`)
  }
  return label
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

export function developmentUrl(name: string | null, service: "app" | "stories" | "e2e") {
  return `https://${[name, service === "app" ? "" : service, developmentDomain].filter(Boolean).join(".")}`
}

export function localAppEnvironment(url: string) {
  return {
    APP_URL: url,
    APP_ALIAS_URLS: "",
    WORKOS_REDIRECT_URI: `${url}/callback`,
    WORKOS_COOKIE_DOMAIN: "",
    COPACKER_LOCAL: "1"
  }
}
