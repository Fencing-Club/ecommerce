import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight, Check, Handshake, LifeBuoy, MessageCircle, Newspaper, Presentation, Rocket } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Controller, FormProvider, useForm } from "react-hook-form"
import { useTranslations } from "use-intl"
import type { z } from "zod"
import { FormInput, FormTextarea } from "@/components/form-controls"
import { useFormErrorMap } from "@/hooks/use-error-text"
import type { ContactTopic } from "@/lib/contact"
import { contactSchema, contactTopics } from "@/lib/contact"
import { cn } from "@/lib/utils"

// The contact page's form: what it's about as a set of tiles, then who's writing and the message. Once it's sent, a
// parcel addressed to Copacker drops into its place.

// Each topic's icon, and its key under marketing.contact.form.topics.
const topics: Record<ContactTopic, { icon: typeof Rocket; key: TopicKey }> = {
  "Early access": { icon: Rocket, key: "earlyAccess" },
  "A walkthrough": { icon: Presentation, key: "walkthrough" },
  Support: { icon: LifeBuoy, key: "support" },
  Partnerships: { icon: Handshake, key: "partnerships" },
  Press: { icon: Newspaper, key: "press" },
  "Something else": { icon: MessageCircle, key: "other" }
}
type TopicKey = "earlyAccess" | "walkthrough" | "support" | "partnerships" | "press" | "other"

const blank = { topic: "Early access", name: "", email: "", company: "", message: "" } as const

// A kraft box, taped and labeled for Copacker, that drops in and settles, with a check stamped on its corner.
function Parcel() {
  return (
    <div className="relative size-40">
      <svg
        viewBox="0 0 160 160"
        aria-hidden
        className="size-full motion-safe:animate-in motion-safe:duration-700 motion-safe:fill-mode-both motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-safe:slide-in-from-top-10 motion-safe:zoom-in-75"
      >
        <ellipse cx="80" cy="140" rx="54" ry="8" fill="rgb(60 30 10 / 0.12)" />
        <path d="M80 30 L140 58 L80 86 L20 58 Z" fill="#e3b98a" />
        <path d="M20 58 L80 86 L80 142 L20 114 Z" fill="#c99760" />
        <path d="M140 58 L80 86 L80 142 L140 114 Z" fill="#b5834f" />
        <path d="M44 47 L104 75 L116 69 L56 41 Z" fill="#f1d3a6" />
        <path d="M104 75 L104 131 L116 125 L116 69 Z" fill="#e6c28e" />
        <g className="motion-safe:animate-in motion-safe:delay-500 motion-safe:duration-300 motion-safe:fill-mode-both motion-safe:fade-in motion-safe:zoom-in-150">
          <path d="M30 76 L64 92 L64 118 L30 102 Z" fill="#ffffff" />
          <path d="M35 84 L50 91 M35 90 L58 101 M35 96 L54 105" stroke="#26221f" strokeWidth="2.5" />
        </g>
      </svg>
      <span className="absolute top-3 right-2 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg motion-safe:animate-in motion-safe:delay-700 motion-safe:duration-500 motion-safe:fill-mode-both motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-safe:zoom-in-0">
        <Check className="size-5" strokeWidth={3} />
      </span>
    </div>
  )
}

function Sent({ email, onAnother }: { email: string; onAnother: () => void }) {
  const t = useTranslations("marketing.contact.form")
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <div className="col-start-1 row-start-1 flex flex-col items-center justify-center px-6 py-16 text-center sm:py-20">
      <Parcel />
      <h2 ref={heading} tabIndex={-1} className="mt-8 text-3xl font-semibold tracking-tight outline-none">
        {t("sent")}
      </h2>
      <p className="mt-3 max-w-sm text-pretty text-muted-foreground">{t("writeBack", { email })}</p>
      <Button variant="outline" className="mt-8" onClick={onAnother}>
        {t("another")}
      </Button>
    </div>
  )
}

export function ContactForm() {
  const t = useTranslations("marketing.contact.form")
  const formErrorMap = useFormErrorMap()
  const form = useForm<z.input<typeof contactSchema>, unknown, z.output<typeof contactSchema>>({
    resolver: zodResolver(contactSchema, { error: formErrorMap }),
    defaultValues: blank
  })
  const [sent, setSent] = useState<string | null>(null)
  // "Send another" brings the form back with focus on its first choice, rather than dropping it to the page.
  const formElement = useRef<HTMLFormElement>(null)
  const again = useRef(false)
  useEffect(() => {
    if (!sent && again.current) {
      again.current = false
      formElement.current?.querySelector<HTMLInputElement>("input[type=radio]:checked")?.focus()
    }
  }, [sent])
  const submit = form.handleSubmit(async (values, event) => {
    const website = event?.target instanceof HTMLFormElement ? new FormData(event.target).get("website") : ""
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, website })
    }).catch(() => null)
    if (response?.ok) {
      setSent(values.email)
      return
    }
    const body: unknown = await response?.json().catch(() => null)
    form.setError("root.server", {
      message:
        typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : t("failed")
    })
  })
  const problem = form.formState.errors.root?.server?.message

  // Once it's sent, the form stays in its place, hidden, under the message that says so, so the card keeps its height.
  return (
    <div className="light grid grid-cols-1 overflow-hidden rounded-[1.75rem] bg-background text-foreground shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_50px_120px_-40px_rgb(40_20_5/0.5)]">
      <FormProvider {...form}>
        <form
          ref={formElement}
          onSubmit={submit}
          noValidate
          className={cn("col-start-1 row-start-1 grid lg:grid-cols-[19rem_minmax(0,1fr)]", sent && "invisible")}
        >
          <fieldset className="border-b bg-muted/40 p-6 sm:p-8 lg:border-e lg:border-b-0">
            <legend className="float-start mb-4 w-full text-sm font-medium">{t("topic")}</legend>
            <Controller
              name="topic"
              control={form.control}
              render={({ field }) => (
                // One to a row on a phone: two leave too little room for a word such as Partnerships beside its icon.
                <div className="clear-both grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {contactTopics.map((topic) => {
                    const { icon: Icon, key } = topics[topic]
                    const chosen = field.value === topic
                    return (
                      <label
                        key={topic}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl border bg-background px-3 py-2.5 text-sm transition-[border-color,box-shadow,background-color] has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                          chosen
                            ? "border-primary/50 shadow-[0_0_0_3px_rgb(245_74_0/0.12)]"
                            : "border-border hover:border-foreground/20"
                        )}
                      >
                        <input
                          type="radio"
                          name={field.name}
                          value={topic}
                          checked={chosen}
                          onChange={() => field.onChange(topic)}
                          className="sr-only"
                        />
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                            chosen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 font-medium break-words">{t(`topics.${key}`)}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            />
          </fieldset>
          <div className="flex flex-col gap-5 p-6 sm:p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormInput name="name" required label={t("name")} autoComplete="name" />
              <FormInput name="email" required label={t("email")} type="email" autoComplete="email" />
            </div>
            <FormInput name="company" label={t("company")} autoComplete="organization" />
            <FormTextarea
              name="message"
              required
              label={t("message")}
              rows={6}
              className="flex-1 [&_textarea]:min-h-44"
            />
            {/* A field people never see, for telling bots apart. */}
            <input
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="absolute -left-[9999px] size-px opacity-0"
            />
            <div className="flex flex-wrap items-center justify-end gap-4">
              {problem && (
                <p role="alert" className="me-auto text-sm text-destructive">
                  {problem}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={form.formState.isSubmitting}
                className="h-11 gap-2 rounded-xl px-5 text-[0.9375rem]"
              >
                {form.formState.isSubmitting ? t("sending") : t("send")}
                <ArrowRight className="rtl:rotate-180" />
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
      {sent && (
        <Sent
          email={sent}
          onAnother={() => {
            again.current = true
            setSent(null)
            form.reset(blank)
          }}
        />
      )}
    </div>
  )
}
