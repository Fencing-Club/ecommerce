// How to add Copacker's MCP server to each agent the page names: where the setup goes, and the exact snippet to copy.
// Every one of them takes the hosted server's URL and signs in with OAuth; agents on your machine can also run the
// CLI's own server. Each follows the client's own documentation as of September 2026, so check them there when a
// client changes how it adds servers.

export type Setup = {
  // Its key under marketing.connect.setups, which holds the one line on what to do with the snippet.
  key: SetupKey
  // The agent's name. The catch-all's is translated (marketing.connect.anyClient).
  name: string
  // Where the snippet goes: a menu or a file's path as the agent names it, or the terminal or a server URL field, which
  // are translated.
  where: string | { place: "terminal" | "serverUrl" }
  code: string
  // A command the line names, kept as it is in every language.
  command?: string
  // The catch-all, drawn apart from the named agents.
  any?: boolean
}

type SetupKey =
  | "claude"
  | "chatgpt"
  | "claudeCode"
  | "codex"
  | "cursor"
  | "vsCode"
  | "gemini"
  | "windsurf"
  | "zed"
  | "openCode"
  | "hermes"
  | "openClaw"
  | "any"

const terminal = { place: "terminal" } as const

const url = "https://copacker.ai/mcp"

export const setups: Setup[] = [
  {
    key: "claude",
    name: "Claude",
    where: "Customize, Connectors",
    code: url
  },
  {
    key: "chatgpt",
    name: "ChatGPT",
    where: "Plugins, Developer mode",
    code: url
  },
  {
    key: "claudeCode",
    name: "Claude Code",
    where: terminal,
    command: "/mcp",
    code: `claude mcp add --transport http --scope user copacker ${url}`
  },
  {
    key: "codex",
    name: "Codex",
    where: terminal,
    code: `codex mcp add copacker --url ${url}`
  },
  {
    key: "cursor",
    name: "Cursor",
    where: "~/.cursor/mcp.json",
    code: `{
  "mcpServers": {
    "copacker": {
      "url": "${url}"
    }
  }
}`
  },
  {
    key: "vsCode",
    name: "VS Code",
    where: ".vscode/mcp.json",
    code: `{
  "servers": {
    "copacker": {
      "type": "http",
      "url": "${url}"
    }
  }
}`
  },
  {
    key: "gemini",
    name: "Gemini CLI",
    where: terminal,
    command: "/mcp auth copacker",
    code: `gemini mcp add --scope user --transport http copacker ${url}`
  },
  {
    key: "windsurf",
    name: "Windsurf",
    where: "mcp_config.json",
    code: `{
  "mcpServers": {
    "copacker": {
      "url": "${url}"
    }
  }
}`
  },
  {
    key: "zed",
    name: "Zed",
    where: "settings.json",
    code: `{
  "context_servers": {
    "copacker": {
      "url": "${url}"
    }
  }
}`
  },
  {
    key: "openCode",
    name: "OpenCode",
    where: "~/.config/opencode/opencode.json",
    code: `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "copacker": {
      "type": "remote",
      "url": "${url}"
    }
  }
}`
  },
  {
    key: "hermes",
    name: "Hermes",
    where: terminal,
    code: `hermes mcp add copacker --url ${url} --auth oauth`
  },
  {
    key: "openClaw",
    name: "OpenClaw",
    where: terminal,
    code: `openclaw mcp add copacker --url ${url} --transport streamable-http --auth oauth
openclaw mcp login copacker`
  },
  {
    key: "any",
    name: "Any MCP client",
    where: { place: "serverUrl" },
    command: "copacker mcp serve",
    code: url,
    any: true
  }
]
