"use client"

import { useClipboard, useInViewport, useReducedMotion } from "@mantine/hooks"
import { useEffect, useState } from "react"
import { useTranslations } from "use-intl"
import { cn } from "@/lib/utils"
import { CopyButton } from "./copy-button"
import { setups } from "./setups"
import { usePageIdle } from "./use-page-idle"

// How agents reach Copacker: pick yours, and its own setup shows, ready to copy (./setups); and the CLI, which reads
// the same data for scripts and coding agents. The terminal types out its session once it scrolls into view.

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
STAR-2HVN7KQ9   Amazon AWD US  75 cartons   Packing`
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
  const t = useTranslations("marketing.connect")
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
    <figure
      ref={ref}
      className="overflow-hidden rounded-2xl bg-[#0b0a09] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] ring-1 ring-white/10 has-focus-visible:ring-3 has-focus-visible:ring-white/40"
    >
      <figcaption className="sr-only">{t("session")}</figcaption>
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-2.5 rounded-full bg-white/15" />
        ))}
        <span className="ms-2 text-xs text-white/50">copacker</span>
      </div>
      <pre
        dir="ltr"
        // The session's longest lines run past a narrow terminal, so it scrolls sideways, and takes focus so the
        // keyboard can scroll it too.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="min-h-[21.5rem] overflow-x-auto p-5 font-mono text-[0.8125rem] leading-6 text-white/85 outline-none [scrollbar-width:none]"
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
    </figure>
  )
}

// Any MCP client can connect. Picking an agent shows exactly how to add Copacker to it.
function Agents() {
  const t = useTranslations("marketing.connect")
  const [chosen, setChosen] = useState(setups[0]?.name ?? "")
  const clipboard = useClipboard({ timeout: 1800 })
  const setup = setups.find((entry) => entry.name === chosen) ?? setups[0]
  if (!setup) {
    return null
  }
  return (
    <div className="flex flex-col gap-6 rounded-3xl bg-white/[0.03] p-6 ring-1 ring-white/10 sm:p-8">
      <div className="flex flex-col gap-3">
        <h3 className="text-2xl font-semibold tracking-tight">{t("title")}</h3>
        <p className="text-pretty text-white/60">{t("text")}</p>
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t("yourAgent")}</legend>
        {setups.map((entry) => (
          <label
            key={entry.name}
            className={cn(
              "cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-white/40",
              entry.name === setup.name
                ? "bg-white text-[#1c1917] ring-white"
                : "bg-white/[0.06] text-white/85 ring-white/10 hover:bg-white/10",
              entry.any &&
                entry.name !== setup.name &&
                "bg-transparent text-white/60 outline-1 -outline-offset-1 outline-white/25 outline-dashed ring-0"
            )}
          >
            <input
              type="radio"
              name="agent"
              value={entry.name}
              checked={entry.name === setup.name}
              onChange={() => {
                setChosen(entry.name)
                clipboard.reset()
              }}
              className="sr-only"
            />
            {entry.any ? t("anyClient") : entry.name}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-3">
        <p className="min-h-10 text-sm text-pretty text-white/55">
          {t(`setups.${setup.key}`, { command: setup.command ?? "" })}
        </p>
        <div
          className={cn(
            "overflow-hidden rounded-xl bg-black/30 ring-1 transition-[box-shadow] duration-500",
            clipboard.copied ? "shadow-[0_0_0_4px_rgb(52_211_153/0.15)] ring-emerald-400/50" : "ring-white/10"
          )}
        >
          <div className="flex items-center gap-3 border-b border-white/[0.06] py-2 pe-2 ps-4">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-white/45">
              {typeof setup.where === "string" ? setup.where : t(setup.where.place)}
            </span>
            <CopyButton copied={clipboard.copied} onCopy={() => clipboard.copy(setup.code)} />
          </div>
          <pre
            dir="ltr"
            className="min-h-52 p-4 font-mono text-[0.8125rem] leading-6 whitespace-pre-wrap text-white/85 [overflow-wrap:anywhere]"
          >
            {setup.code}
          </pre>
        </div>
      </div>
    </div>
  )
}

// One column that can shrink below the terminal's longest line, so on a phone the terminal scrolls instead of widening
// both cards past the screen.
export function Connect() {
  const t = useTranslations("marketing.connect")
  // The code is set in Geist Mono, which is fetched only once the page is idle, through a preload: this is far down the
  // page, and the font would otherwise load with the page's first paint. Until then the code uses the computer's own
  // monospace. The code is all ASCII.
  const idle = usePageIdle({ family: "Geist Mono", text: "a" })
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6 lg:grid-cols-2",
        !idle && "[--font-geist-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace]"
      )}
    >
      <Agents />
      <div className="flex flex-col gap-6 rounded-3xl bg-white/[0.03] p-6 ring-1 ring-white/10 sm:p-8">
        <div className="flex flex-col gap-3">
          <h3 className="text-2xl font-semibold tracking-tight">{t("cli.title")}</h3>
          <p className="text-pretty text-white/60">{t("cli.text")}</p>
        </div>
        <div className={cn("mt-auto")}>
          <Terminal />
        </div>
      </div>
    </div>
  )
}
