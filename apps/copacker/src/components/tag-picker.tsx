"use client"

import { Plus, X } from "lucide-react"
import { type RefObject, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import * as styles from "./tag-picker.css"

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
  const matches = suggestions
    .filter((tag) => !value.some((chosen) => same(chosen, tag)))
    .filter((tag) => tag.toLowerCase().includes(draft.trim().toLowerCase()))
    .slice(0, shownSuggestions)
  return (
    <>
      {/* Clicking the box's empty space types into it, as with a text input. */}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className={styles.box} onClick={() => input.current?.focus()}>
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className={styles.chip}>
            {tag}
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(value.filter((chosen) => chosen !== tag))}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </Badge>
        ))}
        <input
          ref={input}
          id={id}
          className={styles.input}
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
          onBlur={() => draft.trim() && add(draft)}
        />
      </div>
      {matches.length > 0 && (
        <div className={styles.suggestions}>
          {matches.map((tag) => (
            <Button key={tag} type="button" variant="outline" size="xs" onClick={() => add(tag)}>
              <Plus data-icon="inline-start" />
              {tag}
            </Button>
          ))}
        </div>
      )}
    </>
  )
}
