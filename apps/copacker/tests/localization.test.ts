import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { locales, negotiateLocale } from "../src/i18n/locales"
import { english } from "../src/i18n/messages"

describe("the computer's language", () => {
  it("picks the best supported language from Accept-Language", () => {
    expect(negotiateLocale("de-AT,de;q=0.9,en;q=0.8")).toBe("de")
    expect(negotiateLocale("pt-BR,pt;q=0.9,fr;q=0.8")).toBe("fr")
    expect(negotiateLocale("en;q=0.5,es;q=0.9")).toBe("es-MX")
    expect(negotiateLocale("zh-Hans-CN,zh;q=0.9")).toBe("zh-CN")
    expect(negotiateLocale("zh-SG")).toBe("zh-CN")
    expect(negotiateLocale("zh-TW")).toBe("zh-CN")
    expect(negotiateLocale("es-ES,es;q=0.9")).toBe("es-MX")
    expect(negotiateLocale("ur-PK")).toBe("ur")
  })

  it("falls back to English", () => {
    expect(negotiateLocale(null)).toBe("en")
    expect(negotiateLocale("")).toBe("en")
    expect(negotiateLocale("ja-JP,ko;q=0.9")).toBe("en")
    expect(negotiateLocale("*")).toBe("en")
  })
})

// The ICU arguments a message takes: "{count, plural, one {# box} other {# boxes}} for {name}" takes count and name.
// Plural and select branches are messages themselves, so their keys ("one", "other") aren't arguments.
function argumentsOf(message: string) {
  const found = new Set<string>()
  let at = 0
  const text = (): void => {
    while (at < message.length && message[at] !== "}") {
      if (message[at] === "{") {
        at++
        argument()
      } else {
        at++
      }
    }
  }
  const argument = () => {
    const [name = "", type = ""] = message
      .slice(at)
      .split(/[,}]/, 2)
      .map((part) => part.trim())
    found.add(name)
    at = message.indexOf(name, at) + name.length
    if (message[at] === "}") {
      at++
      return
    }
    // A plural or select: "type, key {message} key {message}}"; any other type, such as "number", ends at its "}".
    at = message.indexOf(type, at) + type.length
    if (!["plural", "select", "selectordinal"].includes(type)) {
      at = message.indexOf("}", at) + 1
      return
    }
    at = message.indexOf(",", at) + 1
    while (at < message.length && message[at] !== "}") {
      if (message[at] === "{") {
        at++
        text()
      }
      at++
    }
    at++
  }
  text()
  return [...found].toSorted()
}

// Each message's path and the ICU arguments it takes, such as "orders.count {count}".
function signatures(messages: unknown, path = ""): string[] {
  if (typeof messages === "string") {
    return [`${path} {${argumentsOf(messages).join(",")}}`]
  }
  if (typeof messages === "object" && messages !== null) {
    return Object.entries(messages).flatMap(([key, value]) => signatures(value, path ? `${path}.${key}` : key))
  }
  return [`${path} is not a message`]
}

describe("translations", () => {
  const expected = signatures(english).toSorted()
  it.each(locales.filter((locale) => locale !== "en"))(
    "%s has every English message with the same arguments",
    (locale) => {
      const translated = Object.fromEntries(
        Object.keys(english).map((namespace) => [
          namespace,
          JSON.parse(readFileSync(new URL(`../messages/${locale}/${namespace}.json`, import.meta.url), "utf8"))
        ])
      )
      expect(signatures(translated).toSorted()).toEqual(expected)
    }
  )
})
