import { ChevronDown } from "lucide-react"
import { useFormatter, useTranslations } from "use-intl"
import { cn } from "@/lib/utils"
import { Site } from "./site"
import "./stylesheet"

// The privacy policy and the terms: documents on the paper, with none of the landing page's staging. The text keeps a
// comfortable measure, every section has an anchor, and on a wide screen the contents stay beside it. The frame is in
// the reader's language; the text itself stays in English in every language until a lawyer has reviewed a translation,
// so it's marked lang="en" (and dir="ltr", for Urdu) for screen readers, fonts and line breaking.

type Section = { id: string; title: string; content: React.ReactNode }

// The document's type, set once for the plain elements the pages write: paragraphs, lists, subheadings and links.
const prose = cn(
  "text-pretty text-foreground/80",
  "[&_p]:mt-4 [&_ul]:mt-4 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5 [&_ul]:marker:text-foreground/30 [&_li]:pl-1",
  "[&_h3]:mt-9 [&_h3]:scroll-mt-24 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-[-0.01em] [&_h3]:text-foreground",
  "[&_strong]:font-medium [&_strong]:text-foreground",
  "[&_a]:rounded-sm [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:decoration-foreground/25 [&_a]:underline-offset-4 [&_a]:transition-colors [&_a]:outline-none [&_a:focus-visible]:ring-3 [&_a:focus-visible]:ring-ring/50 [&_a:hover]:decoration-foreground"
)

// Names and what each is for, such as the providers that run Copacker, in the hairline rows the FAQ uses.
export function Rows({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <dl className="mt-6 border-t border-foreground/10">
      {rows.map(([name, text]) => (
        <div
          key={name}
          className="grid gap-1 border-b border-foreground/10 py-4 sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:gap-6"
        >
          <dt className="font-medium text-foreground">{name}</dt>
          <dd>{text}</dd>
        </div>
      ))}
    </dl>
  )
}

// The "last updated" date's <time> element, for the translated sentence around it.
function stamped(dateTime: string) {
  return function Stamp(chunks: React.ReactNode) {
    return <time dateTime={dateTime}>{chunks}</time>
  }
}

function Contents({ sections }: { sections: Section[] }) {
  return (
    <ol lang="en" dir="ltr" className="flex flex-col gap-2.5 text-sm leading-snug">
      {sections.map((section) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="focus-ring rounded-sm text-foreground/65 transition-colors hover:text-foreground"
          >
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  )
}

export function Legal({
  title,
  updated,
  lead,
  sections
}: {
  title: string
  // The day the text last changed, such as "2026-09-27".
  updated: string
  lead: string
  sections: Section[]
}) {
  const t = useTranslations("legal")
  const format = useFormatter()
  const date = format.dateTime(new Date(`${updated}T00:00:00Z`), {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })
  return (
    <Site tone="light">
      <main
        id="main-content"
        className="mx-auto max-w-6xl px-6 pt-16 pb-28 sm:pt-24 sm:pb-36 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-20"
      >
        <nav aria-label={t("contents")} className="sticky top-24 hidden self-start lg:block">
          <p className="mb-4 text-sm font-medium">{t("contents")}</p>
          <Contents sections={sections} />
        </nav>
        {/* About 70 characters a line. In rem, as Geist's `ch` (its zero) is far wider than its average letter. */}
        <article className="max-w-[35rem] text-[1.0625rem] leading-[1.75]">
          <header>
            <h1 className="text-[clamp(2.5rem,6vw,3.75rem)] leading-[1] font-semibold tracking-[-0.045em] text-balance urdu:leading-[1.6] urdu:tracking-normal">
              {title}
            </h1>
            <p className="mt-5 text-sm text-foreground/60">{t.rich("updated", { date, time: stamped(updated) })}</p>
          </header>
          <p lang="en" dir="ltr" className="mt-10 text-lg text-pretty text-foreground/80 sm:text-xl sm:leading-relaxed">
            {lead}
          </p>
          <details className="group mt-10 rounded-2xl border border-foreground/10 bg-background/60 lg:hidden">
            <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-base font-medium [&::-webkit-details-marker]:hidden">
              {t("contents")}
              <ChevronDown
                aria-hidden
                className="size-4 text-foreground/50 transition-transform group-open:rotate-180"
              />
            </summary>
            <nav aria-label={t("contents")} className="px-5 pb-5">
              <Contents sections={sections} />
            </nav>
          </details>
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              lang="en"
              dir="ltr"
              aria-labelledby={`${section.id}-title`}
              className="mt-12 scroll-mt-24 border-t border-foreground/10 pt-10"
            >
              <h2 id={`${section.id}-title`} className="text-2xl leading-tight font-semibold tracking-[-0.025em]">
                {section.title}
              </h2>
              <div className={prose}>{section.content}</div>
            </section>
          ))}
        </article>
      </main>
    </Site>
  )
}
