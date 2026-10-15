"use client"

import { Plus, X } from "lucide-react"
import { type RefObject, useRef, useState } from "react"
import { useTranslations } from "use-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const shownSuggestions = 8
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

// Chosen tags as removable chips. Enter or a comma adds what's typed; the store's own tags are suggested as you type.
export function TagPicker({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  inputRef: input
}: {
  id: string
  value: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
  placeholder?: string
  // The text box, so a dialog can focus it when it opens.
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const t = useTranslations("products.tagPicker")
  const [draft, setDraft] = useState("")
  const add = (...tags: string[]) => {
    const next = [...value]
    for (const tag of tags.map((entry) => entry.trim()).filter(Boolean)) {
      if (!next.some((chosen) => same(chosen, tag))) {
        next.push(tag)
      }
    }
    onChange(next)
    setDraft("")
  }
  const list = useRef<HTMLDivElement>(null)
  // Leaving the picker adds what's typed. Moving from the text box to a suggestion doesn't: the typing narrowed the
  // suggestions, and adding it first would move them under the pointer, so the click would land on another.
  const leave = (event: React.FocusEvent) => {
    const next = event.relatedTarget
    if (next instanceof Node && (next === input.current || list.current?.contains(next))) {
      return
    }
    if (draft.trim()) {
      add(draft)
    }
  }
  const matches = suggestions
    .filter((tag) => !value.some((chosen) => same(chosen, tag)))
    .filter((tag) => tag.toLowerCase().includes(draft.trim().toLowerCase()))
    .slice(0, shownSuggestions)
  return (
    <>
      {/* Looks like a text input, with the chosen tags as chips before the typing area. Clicking the box's empty
          space types into it, as with a text input. */}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="flex min-h-8 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
        onClick={() => input.current?.focus()}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-0.5 pe-0.5">
            {tag}
            <button
              type="button"
              className="inline-flex cursor-pointer rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("remove", { tag })}
              onClick={() => onChange(value.filter((chosen) => chosen !== tag))}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}
        <input
          ref={input}
          id={id}
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          value={draft}
          placeholder={value.length ? undefined : placeholder}
          onChange={(event) => {
            const typed = event.target.value
            if (typed.includes(",")) {
              add(...typed.split(","))
            } else {
              setDraft(typed)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft.trim()) {
              event.preventDefault()
              add(draft)
            } else if (event.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={leave}
        />
      </div>
      {matches.length > 0 && (
        <div ref={list} className="flex flex-wrap gap-1" onBlur={leave}>
          {matches.map((tag) => (
            <Button
              key={tag}
              type="button"
              variant="outline"
              size="xs"
              // Keeps focus in the text box, for the next tag, and takes it back there after Enter or Space.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                add(tag)
                input.current?.focus()
              }}
            >
              <Plus data-icon="inline-start" />
              {tag}
            </Button>
          ))}
        </div>
      )}
    </>
  )
}
