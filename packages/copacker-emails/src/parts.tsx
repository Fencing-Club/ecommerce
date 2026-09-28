/** @jsxRuntime automatic */
import type { ReactNode } from "react"
import { Link, Section, Text } from "react-email"
import { color, font } from "./theme"

const cell = { fontFamily: font, fontSize: 14, lineHeight: "20px" } as const
const numbers = { fontVariantNumeric: "tabular-nums" } as const
const rule = `1px solid ${color.line}`

// Rows of cells in one table. The plain text writes it as a table too, each row on a line and each column lined up,
// such as "Required by     Dec 1, 2026", instead of running the cells together.
function Table({ children }: { children: ReactNode }) {
  return (
    <table border={0} cellPadding="0" cellSpacing="0" data-text-format="dataTable" role="presentation" width="100%">
      <tbody>{children}</tbody>
    </table>
  )
}

// Facts about the email's subject as label and value rows in a quiet panel, such as a purchase order's required-by
// date and total.
export function Details({ rows }: { rows: ReadonlyArray<{ label: string; value: ReactNode; strong?: boolean }> }) {
  return (
    <Section
      className="cp-panel"
      style={{
        backgroundColor: color.panel,
        border: rule,
        borderRadius: 12,
        margin: "0 0 24px",
        padding: "4px 18px"
      }}
    >
      <Table>
        {rows.map((row, index) => (
          <tr key={row.label}>
            <td
              className="cp-muted cp-rule"
              style={{
                ...cell,
                borderTop: index ? rule : undefined,
                color: color.muted,
                padding: "11px 16px 11px 0",
                verticalAlign: "top",
                whiteSpace: "nowrap",
                width: "1%"
              }}
            >
              {row.label}
            </td>
            <td
              className="cp-ink cp-rule"
              style={{
                ...cell,
                ...numbers,
                borderTop: index ? rule : undefined,
                color: color.ink,
                fontWeight: row.strong ? 700 : 600,
                padding: "11px 0",
                textAlign: "right",
                verticalAlign: "top"
              }}
            >
              {row.value}
            </td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}

export type LineItem = { quantity: number; name: string; detail?: string; amount: string }

// A purchase order's first lines, each with its quantity and amount, and the line that says how many more there are,
// such as "And 2 more products in the purchase order".
export function LineItems({ items, lang, more }: { items: ReadonlyArray<LineItem>; lang: string; more?: string }) {
  return (
    <Section style={{ margin: "0 0 24px" }}>
      <Table>
        {items.map((item, index) => (
          <tr key={`${item.name}-${index}`}>
            <td
              className="cp-muted cp-rule"
              style={{
                ...cell,
                ...numbers,
                borderTop: rule,
                color: color.muted,
                padding: "12px 12px 12px 0",
                verticalAlign: "top",
                whiteSpace: "nowrap",
                width: 44
              }}
            >
              {item.quantity.toLocaleString(lang)}&nbsp;×
            </td>
            <td
              className="cp-rule"
              style={{ ...cell, borderTop: rule, padding: "12px 12px 12px 0", verticalAlign: "top" }}
            >
              <span className="cp-ink" style={{ color: color.ink, fontWeight: 600 }}>
                {item.name}
              </span>
              {item.detail ? (
                <>
                  <br />
                  <span className="cp-muted" style={{ color: color.muted, fontSize: 13 }}>
                    {item.detail}
                  </span>
                </>
              ) : null}
            </td>
            <td
              className="cp-ink cp-rule"
              style={{
                ...cell,
                ...numbers,
                borderTop: rule,
                color: color.ink,
                padding: "12px 0",
                textAlign: "right",
                verticalAlign: "top",
                whiteSpace: "nowrap"
              }}
            >
              {item.amount}
            </td>
          </tr>
        ))}
      </Table>
      {more ? (
        <Text
          className="cp-muted cp-rule"
          style={{ ...cell, borderTop: rule, color: color.muted, fontSize: 13, margin: 0, padding: "12px 0 0" }}
        >
          {more}
        </Text>
      ) : null}
    </Section>
  )
}

// What to do next, as short numbered steps.
export function Steps({ steps }: { steps: ReadonlyArray<ReactNode> }) {
  return (
    <Section style={{ margin: "0 0 26px" }}>
      <Table>
        {steps.map((step, index) => (
          // The steps are fixed copy in a fixed order, so their position is their key.
          <tr key={index}>
            {/* The gap sits on both sides of the step's words, so it falls between number and words either way round. */}
            <td style={{ padding: "0 0 12px", verticalAlign: "top", width: 24 }}>
              <Text
                style={{
                  backgroundColor: color.brand,
                  borderRadius: 12,
                  color: "#ffffff",
                  fontFamily: font,
                  fontSize: 12,
                  fontWeight: 700,
                  height: 24,
                  lineHeight: "24px",
                  margin: 0,
                  textAlign: "center",
                  width: 24
                }}
              >
                {index + 1}
              </Text>
            </td>
            <td
              className="cp-body"
              style={{
                color: color.body,
                fontFamily: font,
                fontSize: 15,
                lineHeight: "24px",
                padding: "0 12px 12px",
                verticalAlign: "top"
              }}
            >
              {step}
            </td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}

// The button's link written out, for mail apps that break buttons and for readers who copy it. The plain text already
// writes the button's link, so it leaves this out. The label introduces it, such as "Or paste this link into your
// browser:".
export function LinkFallback({ href, label }: { href: string; label: string }) {
  return (
    <Text
      data-skip-in-text
      className="cp-muted"
      style={{ color: color.muted, fontFamily: font, fontSize: 13, lineHeight: "20px", margin: "18px 0 0" }}
    >
      {label}
      <br />
      <Link href={href} style={{ color: color.brand, textDecoration: "underline", wordBreak: "break-all" }}>
        {href}
      </Link>
    </Text>
  )
}

// A date such as "Dec 1, 2026" in the reader's language. It has no time of day, so it's read in UTC to stay the same day
// everywhere.
export const day = (date: string, lang: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(lang, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })
