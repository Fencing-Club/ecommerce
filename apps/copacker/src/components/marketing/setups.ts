// How to add Copacker's MCP server to each agent the page names: where the setup goes, and the exact snippet to copy.
// Every one of them takes the hosted server's URL and signs in with OAuth; agents on your machine can also run the
// CLI's own server. Each follows the client's own documentation as of September 2026, so check them there when a
// client changes how it adds servers.

export type Setup = {
  name: string
  // Where the snippet goes: a menu, the terminal, or a file's path.
  where: string
  // One line on what to do with it.
  how: string
  code: string
  // The catch-all, drawn apart from the named agents.
  any?: boolean
}

const url = "https://copacker.ai/mcp"

export const setups: Setup[] = [
  {
    name: "Claude",
    where: "Customize, Connectors",
    how: "In Claude, open Customize, then Connectors. Add a custom connector with this URL, then connect.",
    code: url
  },
  {
    name: "ChatGPT",
    where: "Plugins, Developer mode",
    how: "In ChatGPT on the web, turn on developer mode under Settings, Security and login, then add this URL in Plugins.",
    code: url
  },
  {
    name: "Claude Code",
    where: "Terminal",
    how: "Run this, then sign in with /mcp in Claude Code.",
    code: `claude mcp add --transport http --scope user copacker ${url}`
  },
  {
    name: "Codex",
    where: "Terminal",
    how: "Run this and sign in when Codex asks. The CLI, the IDE extension and the ChatGPT desktop app share it.",
    code: `codex mcp add copacker --url ${url}`
  },
  {
    name: "Cursor",
    where: "~/.cursor/mcp.json",
    how: "Add Copacker to Cursor’s MCP file, then sign in from Customize.",
    code: `{
  "mcpServers": {
    "copacker": {
      "url": "${url}"
    }
  }
}`
  },
  {
    name: "VS Code",
    where: ".vscode/mcp.json",
    how: "Add Copacker to your workspace’s MCP file, then start it from the file and sign in.",
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
    name: "Gemini CLI",
    where: "Terminal",
    how: "Run this, then sign in with /mcp auth copacker.",
    code: `gemini mcp add --scope user --transport http copacker ${url}`
  },
  {
    name: "Windsurf",
    where: "mcp_config.json",
    how: "Windsurf is now Devin Desktop. Open its MCP config file from the MCPs menu and add Copacker.",
    code: `{
  "mcpServers": {
    "copacker": {
      "url": "${url}"
    }
  }
}`
  },
  {
    name: "Zed",
    where: "settings.json",
    how: "Add Copacker to Zed’s settings, or add it as a remote server under Settings, AI, MCP Servers.",
    code: `{
  "context_servers": {
    "copacker": {
      "url": "${url}"
    }
  }
}`
  },
  {
    name: "OpenCode",
    where: "~/.config/opencode/opencode.json",
    how: "Add Copacker to OpenCode’s config file. It signs in the first time it connects.",
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
    name: "Hermes",
    where: "Terminal",
    how: "Run this, and sign in when Hermes first connects.",
    code: `hermes mcp add copacker --url ${url} --auth oauth`
  },
  {
    name: "OpenClaw",
    where: "Terminal",
    how: "Run these to add Copacker and sign in.",
    code: `openclaw mcp add copacker --url ${url} --transport streamable-http --auth oauth
openclaw mcp login copacker`
  },
  {
    name: "Any MCP client",
    where: "Server URL",
    how: "Point any other client at this URL, or have it run the CLI’s server with copacker mcp serve.",
    code: url,
    any: true
  }
]
