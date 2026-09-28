/** @jsxRuntime automatic */
// Each .tsx file here names React's automatic JSX runtime itself. Copacker's worker runs this package through tsx, which
// applies the app's tsconfig only to the app's own files, so JSX here would otherwise compile to React.createElement.
import type { CSSProperties, ReactNode } from "react"
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text
} from "react-email"
import { LinkFallback } from "./parts"
import { color, css, font, glow } from "./theme"

// A table of one cell that has the class, colors and padding. React Email's Section moves padding from its table to its
// cell, where the phone styles couldn't change it by the table's class, and mail apps such as Outlook ignore padding on
// a table anyway.
function Frame({ children, className, style }: { children: ReactNode; className: string; style: CSSProperties }) {
  return (
    <table border={0} cellPadding="0" cellSpacing="0" role="presentation" width="100%">
      <tbody>
        <tr>
          <td className={className} style={style}>
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

// The hero: Copacker's mark and name, what kind of email it is, the title and its line, on the dark band with the
// orange glow the landing page's hero has. Mail apps don't draw SVG, so the mark is an image the app serves.
function Hero({ appUrl, eyebrow, heading, lead }: { appUrl: string; eyebrow: string; heading: string; lead: string }) {
  return (
    <Frame
      className="cp-band"
      style={{
        backgroundColor: color.band,
        backgroundImage: glow,
        borderRadius: "16px 16px 0 0",
        padding: "28px 36px 34px"
      }}
    >
      <Row data-skip-in-text>
        <Column style={{ width: 30, verticalAlign: "middle" }}>
          <Img alt="" height={30} src={`${appUrl}/email/mark.png`} width={30} style={{ borderRadius: 8 }} />
        </Column>
        <Column
          style={{
            color: "#ffffff",
            fontFamily: font,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: "-0.3px",
            lineHeight: "30px",
            paddingLeft: 10,
            verticalAlign: "middle"
          }}
        >
          Copacker
        </Column>
      </Row>
      <Text
        style={{
          color: color.glowText,
          fontFamily: font,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "1.4px",
          lineHeight: "16px",
          margin: "36px 0 10px",
          textTransform: "uppercase"
        }}
      >
        {eyebrow}
      </Text>
      <Heading
        as="h1"
        className="cp-heading"
        style={{
          color: "#ffffff",
          fontFamily: font,
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: "-0.8px",
          lineHeight: "38px",
          margin: "0 0 12px"
        }}
      >
        {heading}
      </Heading>
      <Text style={{ color: color.bandText, fontFamily: font, fontSize: 16, lineHeight: "26px", margin: 0 }}>
        {lead}
      </Text>
    </Frame>
  )
}

// The one thing to do, as a button in the brand orange.
function Action({ label, href }: { label: string; href: string }) {
  return (
    <Section style={{ paddingTop: 4 }}>
      <Button
        className="cp-button"
        href={href}
        style={{
          backgroundColor: color.brand,
          borderRadius: 10,
          color: "#ffffff",
          fontFamily: font,
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "-0.1px",
          lineHeight: "22px",
          padding: "14px 26px",
          textDecoration: "none"
        }}
      >
        {label}
      </Button>
    </Section>
  )
}

// The words every email has, already in the reader's language. Each email's copy adds its own to these.
export type EmailCopy = {
  // The subject.
  subject: string
  // What kind of email it is, above the title, such as "New purchase order".
  eyebrow: string
  // The title.
  heading: string
  // The sentence under the title.
  lead: string
  // The line inboxes show after the subject.
  preview: string
  // A quiet line under the button.
  note?: string
  // Why this email came, for the footer, such as "Fencing Club sent this purchase order through Copacker."
  reason: string
  // Copacker's line under its name in the footer: "Restocking, handled."
  tagline: string
  // What introduces the button's link written out under the note, such as "Or paste this link into your browser:".
  // Only an email whose link itself matters, such as an invitation's, writes the link out.
  pasteLink?: string
}

// Every Copacker email: the hero on the dark band, then on the white card its details, one button and a quiet note,
// and a footer that says why it came.
export function Layout({
  action,
  appUrl,
  children,
  copy,
  lang
}: {
  action?: { label: string; href: string }
  // Copacker's origin, such as https://copacker.example, which serves the mark.
  appUrl: string
  children?: ReactNode
  copy: EmailCopy
  // The language the email is written in, such as "de".
  lang: string
}) {
  return (
    <Html lang={lang}>
      <Head>
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta content="light dark" name="color-scheme" />
        <meta content="light dark" name="supported-color-schemes" />
        <meta content="telephone=no, date=no, address=no, email=no, url=no" name="format-detection" />
        <title>{copy.heading}</title>
        <style>{css}</style>
      </Head>
      <Body className="cp-page" style={{ backgroundColor: color.page, margin: 0, padding: 0 }}>
        <Preview useTitleTag={false}>{copy.preview}</Preview>
        {/* Body copies the page color to a cell of its own that has no class, so the dark styles couldn't change it; this
        cell covers it. */}
        <Frame className="cp-page cp-outer" style={{ backgroundColor: color.page, padding: "32px 16px 40px" }}>
          <Container style={{ maxWidth: 568 }}>
            <Hero appUrl={appUrl} eyebrow={copy.eyebrow} heading={copy.heading} lead={copy.lead} />
            <Frame
              className="cp-card cp-content"
              style={{
                backgroundColor: color.card,
                border: `1px solid ${color.line}`,
                borderRadius: "0 0 16px 16px",
                borderTop: 0,
                padding: "32px 36px 30px"
              }}
            >
              {children}
              {action ? <Action {...action} /> : null}
              {copy.note ? (
                <Text
                  className="cp-muted"
                  style={{ color: color.muted, fontFamily: font, fontSize: 14, lineHeight: "22px", margin: "20px 0 0" }}
                >
                  {copy.note}
                </Text>
              ) : null}
              {copy.pasteLink && action ? <LinkFallback href={action.href} label={copy.pasteLink} /> : null}
            </Frame>
            <Section style={{ padding: "28px 24px 0", textAlign: "center" }}>
              <Text style={{ fontFamily: font, fontSize: 13, lineHeight: "20px", margin: 0 }}>
                <Link
                  className="cp-ink cp-home"
                  href={appUrl}
                  style={{ color: color.ink, fontWeight: 700, letterSpacing: "-0.1px", textDecoration: "none" }}
                >
                  Copacker
                </Link>
              </Text>
              <Text
                className="cp-muted"
                style={{ color: color.muted, fontFamily: font, fontSize: 12, lineHeight: "18px", margin: "2px 0 12px" }}
              >
                {copy.tagline}
              </Text>
              <Text
                className="cp-muted"
                style={{ color: color.muted, fontFamily: font, fontSize: 12, lineHeight: "18px", margin: 0 }}
              >
                {copy.reason}
              </Text>
            </Section>
          </Container>
        </Frame>
      </Body>
    </Html>
  )
}
