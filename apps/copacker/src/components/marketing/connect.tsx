"use client"

import { useClipboard, useInViewport, useReducedMotion } from "@mantine/hooks"
import { Check, Copy } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

// How agents reach Copacker: over MCP from any client that speaks it, by URL for the chat apps or through the CLI's
// own server for editors and agents on your machine; and the CLI itself, which reads the same data for scripts and
// coding agents. The terminal types out its session once it scrolls into view.

const clients = ["ChatGPT", "Claude", "Cursor", "VS Code", "Hermes", "OpenClaw"]
const url = "https://copacker.ai/mcp"
const config = `{
  "mcpServers": {
    "copacker": {
      "command": "copacker",
      "args": ["mcp", "serve"]
    }
  }
}`

type Line = { command: string } | { output: string }

const session: Line[] = [
  { command: "copacker report restock --json" },
  {
    output: `[
  { "sku": "SM-3201", "status": "reorder_now", "order": 2520 },
  { "sku": "SM-1204", "status": "reorder_soon", "order": 660 }
]`
  },
  { command: "copacker order show 1043 --json" },
  {
    output: `{
  "number": 1043,
  "supplier": "Shenzhen Metalworks",
  "status": "with_supplier"
}`
  },
  { command: "copacker shipment list" },
  {
    output: `FBA17K3Q2XD5    Amazon FBA     45 cartons   Ready for pickup
STAR-2HVN7KQ9   AWD in China   75 cartons   Packing`
  }
]

// How far the session has got: the line it's on and, for a command, how much of it is typed.
function useTyping(start: boolean) {
  const reduced = useReducedMotion()
  const [at, setAt] = useState({ line: 0, typed: 0 })
  useEffect(() => {
    const current = session[at.line]
    if (!start || reduced || !current) {
      return
    }
    const typing = "command" in current && at.typed < current.command.length
    // A keystroke, the pause after a typed command, or a moment to read its output.
    let pause = 650
    if (typing) {
      pause = 26
    } else if ("command" in current) {
      pause = 380
    }
    const timer = setTimeout(
      () => setAt(typing ? { line: at.line, typed: at.typed + 1 } : { line: at.line + 1, typed: 0 }),
      pause
    )
    return () => clearTimeout(timer)
  }, [start, reduced, at])
  return reduced ? { line: session.length, typed: 0 } : at
}

function Terminal() {
  const { ref, inViewport } = useInViewport()
  const [started, setStarted] = useState(false)
  useEffect(() => {
    if (inViewport) {
      const timer = setTimeout(() => setStarted(true), 300)
      return () => clearTimeout(timer)
    }
  }, [inViewport])
  const at = useTyping(started)
  const prompt = <span className="text-[#ff8f45] select-none">$ </span>
  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-2xl bg-[#0b0a09] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] ring-1 ring-white/10"
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-2.5 rounded-full bg-white/15" />
        ))}
        <span className="ml-2 text-xs text-white/40">copacker</span>
      </div>
      <pre
        aria-label="A terminal session with the copacker CLI"
        className="min-h-[21.5rem] overflow-x-auto p-5 font-mono text-[0.8125rem] leading-6 text-white/85 [scrollbar-width:none]"
      >
        {session.map((line, i) => {
          if (i > at.line || (i === at.line && !("command" in line))) {
            return null
          }
          if ("command" in line) {
            const typed = i < at.line ? line.command : line.command.slice(0, at.typed)
            return (
              <span key={line.command} className="block">
                {prompt}
                {typed}
                {i === at.line && <span className="ml-px inline-block h-4 w-2 translate-y-0.5 bg-white/70" />}
              </span>
            )
          }
          return (
            <span key={line.output} className="mb-2 block text-white/55">
              {line.output}
            </span>
          )
        })}
        {at.line >= session.length && (
          <span className="block">
            {prompt}
            <span className="inline-block h-4 w-2 translate-y-0.5 bg-white/70 motion-safe:animate-pulse" />
          </span>
        )}
      </pre>
    </div>
  )
}

export function Connect() {
  const clipboard = useClipboard({ timeout: 1600 })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6 rounded-3xl bg-white/[0.03] p-6 ring-1 ring-white/10 sm:p-8">
        <div className="flex flex-col gap-3">
          <h3 className="text-2xl font-semibold tracking-tight">Works with any agent.</h3>
          <p className="text-pretty text-white/60">
            Add Copacker’s MCP server to your agent, and it works with your restock, orders and shipments like you do.
          </p>
        </div>
        <ul aria-label="Agents that connect over MCP" className="flex flex-wrap gap-2">
          {clients.map((client) => (
            <li
              key={client}
              className="rounded-full bg-white/[0.06] px-3.5 py-1.5 text-sm font-medium text-white/85 ring-1 ring-white/10"
            >
              {client}
            </li>
          ))}
          <li className="rounded-full px-3.5 py-1.5 text-sm text-white/55 ring-1 ring-white/15 ring-inset [--tw-ring-style:dashed] outline-1 -outline-offset-1 outline-white/20 outline-dashed">
            Any MCP client
          </li>
        </ul>
        <Tabs defaultValue="apps" className="mt-auto gap-4">
          <TabsList className="bg-white/[0.06]">
            <TabsTrigger value="apps" className="px-3">
              Chat apps
            </TabsTrigger>
            <TabsTrigger value="local" className="px-3">
              On your machine
            </TabsTrigger>
          </TabsList>
          <TabsContent value="apps" className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-black/30 p-1.5 pl-4 ring-1 ring-white/10">
              <code className="min-w-0 flex-1 truncate font-mono text-sm text-white/85">{url}</code>
              <Button size="sm" variant="secondary" onClick={() => clipboard.copy(url)}>
                {clipboard.copied ? <Check /> : <Copy />}
                {clipboard.copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-sm text-white/50">Add it as a connector in ChatGPT, Claude or any app that takes one.</p>
          </TabsContent>
          <TabsContent value="local" className="flex flex-col gap-3">
            <pre className="overflow-x-auto rounded-xl bg-black/30 p-4 font-mono text-[0.8125rem] leading-6 text-white/85 ring-1 ring-white/10">
              {config}
            </pre>
            <p className="text-sm text-white/50">
              For Cursor, VS Code, Hermes, OpenClaw and other agents on your machine.
            </p>
          </TabsContent>
        </Tabs>
      </div>
      <div className="flex flex-col gap-6 rounded-3xl bg-white/[0.03] p-6 ring-1 ring-white/10 sm:p-8">
        <div className="flex flex-col gap-3">
          <h3 className="text-2xl font-semibold tracking-tight">The same data, in your terminal.</h3>
          <p className="text-pretty text-white/60">
            The copacker CLI reaches the same endpoints as the app, so your scripts and coding agents can read and act
            on everything you can.
          </p>
        </div>
        <div className={cn("mt-auto")}>
          <Terminal />
        </div>
      </div>
    </div>
  )
}
