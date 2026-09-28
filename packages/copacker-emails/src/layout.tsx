/** @jsxRuntime automatic */
// Each .tsx file here names React's automatic JSX runtime itself. Copacker's worker runs this package through tsx, which
// applies the app's tsconfig only to the app's own files, so JSX here would otherwise compile to React.createElement.
import type { ReactNode } from "react"
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from "react-email"

// Copacker's colors as the app sets them: the brand orange, and the neutral scale for text and lines. `dark` is what
// each becomes in mail apps that show a dark inbox and let the email pick its colors there.
const color = { brand: "#ea580c", ink: "#0a0a0a", body: "#404040", muted: "#737373", line: "#e5e5e5" }
const dark = { page: "#0a0a0a", ink: "#fafafa", body: "#d4d4d4", muted: "#a3a3a3", line: "#262626" }

// The reader's own system font: San Francisco on Apple devices, Segoe UI on Windows, Roboto on Android.
const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

// What inline styles can't say: the dark colors and the narrower frame on phones, which elements take by class. The
// page sets no background of its own, so a mail app that darkens emails itself has only the text to recolor.
const css = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .cp-page { background-color: ${dark.page} !important; }
  .cp-ink { color: ${dark.ink} !important; }
  .cp-body { color: ${dark.body} !important; }
  .cp-muted { color: ${dark.muted} !important; }
  .cp-rule { border-color: ${dark.line} !important; }
}
@media only screen and (max-width: 600px) {
  .cp-frame { padding: 32px 20px !important; }
  .cp-heading { font-size: 22px !important; line-height: 30px !important; }
}
`

// Copacker's mark and name, as the app's header shows them. Mail apps don't draw SVG, so the mark is an image the app
// serves; the plain-text version leaves the header out.
function Mark({ appUrl }: { appUrl: string }) {
  return (
    <Section data-skip-in-text style={{ paddingBottom: 40 }}>
      <table border={0} cellPadding={0} cellSpacing={0} role="presentation">
        <tbody>
          <tr>
            <td style={{ verticalAlign: "middle" }}>
              <Img alt="" height={32} src={`${appUrl}/email/mark.png`} width={32} />
            </td>
            <td
              className="cp-ink"
              style={{
                color: color.ink,
                fontFamily: font,
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.2px",
                lineHeight: "32px",
                paddingLeft: 10,
                verticalAlign: "middle"
              }}
            >
              Copacker
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text
      className="cp-body"
      style={{ color: color.body, fontFamily: font, fontSize: 16, lineHeight: "26px", marginBottom: 16, marginTop: 0 }}
    >
      {children}
    </Text>
  )
}

// Every Copacker email: the mark, a title, a line or two, one button, and a quiet footer.
export function Layout({
  action,
  appUrl,
  children,
  heading,
  note,
  preview,
  recipient
}: {
  // The one thing to do, as a button.
  action?: { label: string; href: string }
  // Copacker's origin, such as https://copacker.example, which serves the mark.
  appUrl: string
  children: ReactNode
  // The title, which is also the subject.
  heading: string
  // A quiet line under the button.
  note?: string
  // The line inboxes show after the subject.
  preview: string
  // The address the email went to, for the footer. An email whose note names it already leaves it out.
  recipient?: string
}) {
  return (
    <Html lang="en">
      <Head>
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta content="light dark" name="color-scheme" />
        <meta content="light dark" name="supported-color-schemes" />
        <meta content="telephone=no, date=no, address=no, email=no, url=no" name="format-detection" />
        <title>{heading}</title>
        <style>{css}</style>
      </Head>
      <Body className="cp-page" style={{ margin: 0 }}>
        <Preview useTitleTag={false}>{preview}</Preview>
        <Container style={{ maxWidth: 560, padding: "48px 32px" }} tdClassName="cp-frame">
          <Mark appUrl={appUrl} />
          <Heading
            as="h1"
            className="cp-ink cp-heading"
            style={{
              color: color.ink,
              fontFamily: font,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.4px",
              lineHeight: "32px",
              margin: "0 0 16px"
            }}
          >
            {heading}
          </Heading>
          {children}
          {action ? (
            <Section style={{ paddingTop: 8 }}>
              <Button
                href={action.href}
                style={{
                  backgroundColor: color.brand,
                  borderRadius: 8,
                  color: "#ffffff",
                  fontFamily: font,
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: "20px",
                  padding: "12px 20px",
                  textDecoration: "none"
                }}
              >
                {action.label}
              </Button>
            </Section>
          ) : null}
          {note ? (
            <Text
              className="cp-muted"
              style={{
                color: color.muted,
                fontFamily: font,
                fontSize: 14,
                lineHeight: "22px",
                marginBottom: 0,
                marginTop: 24
              }}
            >
              {note}
            </Text>
          ) : null}
          <Hr className="cp-rule" style={{ borderTop: `1px solid ${color.line}`, margin: "40px 0 20px" }} />
          <Text
            className="cp-muted"
            style={{
              color: color.muted,
              fontFamily: font,
              fontSize: 13,
              lineHeight: "20px",
              marginBottom: 0,
              marginTop: 0
            }}
          >
            {recipient ? `Sent by Copacker to ${recipient}` : "Sent by Copacker"}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
