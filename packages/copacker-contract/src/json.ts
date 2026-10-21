import { jsonObject, type JsonObject } from "./protocol.ts"

/** JSON.parse alone silently accepts duplicate keys; an automation input must have one unambiguous intent. */
export function parseInput(text: string): JsonObject {
  if (new TextEncoder().encode(text).length > 1048576) {
    throw new Error("JSON input exceeds 1 MiB.")
  }
  let offset = 0
  const space = () => {
    while (/\s/.test(text[offset] ?? "") && offset < text.length) {
      offset++
    }
  }
  const string = (): string => {
    const start = offset++
    while (offset < text.length) {
      const char = text[offset++]
      if (char === "\\") {
        offset++
      } else if (char === '"') {
        return JSON.parse(text.slice(start, offset))
      }
    }
    throw new Error("Unterminated JSON string.")
  }
  const value = (depth = 0): void => {
    if (depth > 128) {
      throw new Error("JSON input is nested too deeply.")
    }
    space()
    if (text[offset] === '"') {
      string()
      return
    }
    if (text[offset] === "{" || text[offset] === "[") {
      const object = text[offset++] === "{"
      const end = object ? "}" : "]"
      const keys = new Set<string>()
      space()
      if (text[offset] === end) {
        offset++
        return
      }
      while (offset < text.length) {
        space()
        if (object) {
          if (text[offset] !== '"') {
            throw new Error("Expected a JSON property name.")
          }
          const key = string()
          if (keys.has(key)) {
            throw new Error(`Duplicate JSON property: ${key}`)
          }
          keys.add(key)
          space()
          if (text[offset++] !== ":") {
            throw new Error("Expected a colon.")
          }
        }
        value(depth + 1)
        space()
        const separator = text[offset++]
        if (separator === end) {
          return
        }
        if (separator !== ",") {
          throw new Error("Expected a JSON separator.")
        }
      }
      throw new Error("Unterminated JSON value.")
    }
    const scalar = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(offset))
    if (!scalar) {
      throw new Error("Invalid JSON value.")
    }
    offset += scalar[0].length
  }
  value()
  space()
  if (offset !== text.length) {
    throw new Error("Unexpected data after JSON input.")
  }
  return jsonObject.parse(JSON.parse(text))
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`
}
