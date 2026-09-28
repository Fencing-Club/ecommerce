"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { FormProvider, type Path, useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import { FormError, SubmitButton } from "@/components/actions"
import { BrandMark, Stage } from "@/components/auth/stage"
import { Button } from "@/components/ui/button"
import { useErrorMessage, useFormErrorMap } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"
import { companySchema, personSchema, placeSchema, type WorkspaceKind, workspaceKinds } from "@/lib/onboarding"
import { cn } from "@/lib/utils"
import {
  AboutFields,
  AddressStepFields,
  CompanyFields,
  RoleFields,
  useStepHeading,
  type WizardStep
} from "./wizard-steps"
import { WorkspacePreview } from "./workspace-preview"

const wizardSchema = z.object({
  person: personSchema,
  kind: z.union([z.enum(workspaceKinds), z.literal("")]).refine((kind) => kind !== "", "onboarding.wizard.chooseRole"),
  company: companySchema,
  address: placeSchema
})
export type WizardValues = z.input<typeof wizardSchema>

// The fields each step checks before moving on.
const stepFields: Record<WizardStep, Array<Path<WizardValues>>> = {
  about: ["person.firstName", "person.lastName", "person.position"],
  role: ["kind"],
  company: ["company.name", "company.website", "company.phone"],
  address: [
    "address.name",
    "address.address.name",
    "address.address.phoneNumber",
    "address.address.email",
    "address.address.addressLine1",
    "address.address.addressLine2",
    "address.address.city",
    "address.address.stateOrRegion",
    "address.address.postalCode",
    "address.address.countryCode"
  ]
}

// What the last step does: make a workspace (accepting the buyer's invitation that brought them, if one did), join
// the workspace a colleague invited them to, or only save the person's profile before returning to `next`.
export type WizardFinish =
  | { type: "workspace"; invitation: { kind: "supplier" | "forwarder"; token: string } | null }
  | { type: "join"; token: string; workspace: string }
  | { type: "profile"; company: string; next: string }

// The browser's country, to start an address from, such as US for en-US.
function browserCountry() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region ?? ""
    return /^[A-Z]{2}$/.test(region) ? region : ""
  } catch {
    return ""
  }
}

// Getting started, one step at a time, beside a preview of the workspace taking shape. The answers stay in one form
// as the steps change, so going back keeps them; the last step saves everything at once.
export function OnboardingWizard({
  steps,
  finish,
  kind: settled,
  initial,
  invitedBy,
  account
}: {
  steps: WizardStep[]
  finish: WizardFinish
  // The kind an invitation settles, so it isn't asked.
  kind: WorkspaceKind | null
  initial: WizardValues
  // The workspace whose invitation brought them.
  invitedBy: string | null
  // The corner across from the logo: who's signed in and a way out.
  account: React.ReactNode
}) {
  const t = useTranslations("onboarding")
  const router = useRouter()
  const [run] = useActionMutation()
  const errorMessage = useErrorMessage()
  const formErrorMap = useFormErrorMap()
  const form = useForm<WizardValues, unknown, z.output<typeof wizardSchema>>({
    resolver: zodResolver(wizardSchema, { error: formErrorMap }),
    defaultValues: initial,
    mode: "onTouched"
  })
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState<"forward" | "back">("forward")
  const [moved, setMoved] = useState(false)
  const [pending, setPending] = useState<"finish" | "skip" | null>(null)
  const [error, setError] = useState("")
  const heading = useRef<HTMLHeadingElement>(null)
  const chosen = useWatch({ control: form.control, name: "kind" })
  const kind = settled ?? chosen
  const step = steps[index] ?? "about"
  const last = index === steps.length - 1
  const { title, description } = useStepHeading(step, kind)

  function finishLabel() {
    if (finish.type === "workspace") {
      return t("wizard.createWorkspace")
    }
    return finish.type === "join" ? t("wizard.join", { workspace: finish.workspace }) : t("wizard.continue")
  }

  // A new step's title takes focus, so a screen reader announces it; the first step's doesn't, on arrival.
  useEffect(() => {
    if (moved) {
      heading.current?.focus()
    }
  }, [index, moved])

  // The address starts from what's known: a name for it, the person, the company's phone and the browser's country.
  function prepareAddress() {
    const { person, company, address } = form.getValues()
    const fill = (name: Path<WizardValues>, value: string, current: string) => {
      if (!current.trim() && value) {
        form.setValue(name, value)
      }
    }
    fill("address.name", kind ? t(`addressNames.${kind}`) : "", address.name)
    fill("address.address.name", `${person.firstName} ${person.lastName}`.trim().slice(0, 50), address.address.name)
    fill("address.address.phoneNumber", company.phone, address.address.phoneNumber ?? "")
    fill("address.address.countryCode", browserCountry(), address.address.countryCode)
  }

  function go(to: number) {
    setError("")
    setDirection(to > index ? "forward" : "back")
    setMoved(true)
    if (steps[to] === "address") {
      prepareAddress()
    }
    setIndex(to)
  }

  // Saves everything, with the address or without it when it's skipped. `via` is the button that shows the spinner.
  async function complete(withAddress: boolean, via: "finish" | "skip") {
    const values = form.getValues()
    let request: { action: string; data: Record<string, unknown> }
    if (finish.type === "workspace") {
      request = {
        action: "onboarding.workspace",
        data: {
          person: values.person,
          kind: finish.invitation?.kind ?? values.kind,
          company: { ...values.company, phone: kind === "supplier" ? values.company.phone : "" },
          address: withAddress ? values.address : null,
          invitation: finish.invitation
        }
      }
    } else if (finish.type === "join") {
      request = { action: "onboarding.join", data: { kind: "team", token: finish.token, person: values.person } }
    } else {
      request = { action: "profile.update", data: { ...values.person, company: finish.company } }
    }
    setPending(via)
    setError("")
    try {
      const result = await run(request).unwrap()
      router.push(finish.type === "profile" ? finish.next : (result.redirect ?? "/"))
      router.refresh()
    } catch (failure) {
      setError(errorMessage(failure))
      setPending(null)
    }
  }

  async function next() {
    if (pending) {
      return
    }
    if (!(await form.trigger(stepFields[step], { shouldFocus: true }))) {
      return
    }
    if (step === "address" && kind === "supplier" && !form.getValues("address.address.phoneNumber")?.trim()) {
      form.setError("address.address.phoneNumber", { message: t("wizard.pickupPhone") }, { shouldFocus: true })
      return
    }
    if (last) {
      await complete(step === "address", "finish")
      return
    }
    go(index + 1)
  }

  return (
    <FormProvider {...form}>
      <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <Stage>
          <div className="relative px-12 pt-10 xl:px-16">
            <BrandMark />
          </div>
          <div className="relative flex flex-1 items-center justify-center px-10 py-12 xl:px-14">
            <WorkspacePreview step={step} kind={kind} />
          </div>
        </Stage>
        <div className="flex min-w-0 flex-col px-6 pt-6 pb-10 sm:px-10 lg:px-14">
          <header className="flex min-h-8 items-center justify-between gap-4">
            <BrandMark className="lg:invisible" />
            {account}
          </header>
          <main id="main-content" className="flex flex-1 flex-col justify-center py-10">
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                void next()
              }}
              className="mx-auto flex w-full max-w-md flex-col gap-8 [&_[data-slot=input]]:h-10 [&_[data-slot=select-trigger]]:h-10"
            >
              {steps.length > 1 && (
                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    {t("wizard.step", { current: index + 1, total: steps.length })}
                  </span>
                  <div className="flex gap-1.5" aria-hidden>
                    {steps.map((item, position) => (
                      <span
                        key={item}
                        className={cn(
                          "h-1 flex-1 rounded-full bg-muted transition-colors duration-500",
                          position <= index && "bg-primary"
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div
                key={step}
                className={cn(
                  "flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 motion-safe:ease-out",
                  moved && direction === "forward" && "motion-safe:slide-in-from-end-4",
                  moved && direction === "back" && "motion-safe:slide-in-from-start-4"
                )}
              >
                <div className="flex flex-col gap-2">
                  {invitedBy && (
                    <span className="w-fit rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {t("wizard.invitedBy", { name: invitedBy })}
                    </span>
                  )}
                  <h1
                    ref={heading}
                    tabIndex={-1}
                    className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] text-balance outline-none"
                  >
                    {title}
                  </h1>
                  {description && <p className="text-sm text-muted-foreground">{description}</p>}
                </div>
                {step === "about" && <AboutFields />}
                {step === "role" && <RoleFields />}
                {step === "company" && <CompanyFields kind={kind} />}
                {step === "address" && <AddressStepFields kind={kind} />}
              </div>
              <FormError message={error} />
              <div className="flex items-center gap-2">
                {index > 0 && (
                  <Button type="button" variant="ghost" className="h-10" onClick={() => go(index - 1)}>
                    <ArrowLeft data-icon="inline-start" className="rtl:rotate-180" />
                    {t("wizard.back")}
                  </Button>
                )}
                <div className="ms-auto flex items-center gap-2">
                  {step === "address" && last && (
                    <SubmitButton
                      type="button"
                      variant="ghost"
                      className="h-10"
                      pending={pending === "skip"}
                      disabled={pending === "finish"}
                      onClick={() => void complete(false, "skip")}
                    >
                      {t("wizard.skip")}
                    </SubmitButton>
                  )}
                  <SubmitButton
                    type="submit"
                    className="h-10 px-4"
                    pending={pending === "finish"}
                    disabled={pending === "skip"}
                  >
                    {last ? finishLabel() : t("wizard.continue")}
                    {!last && <ArrowRight data-icon="inline-end" className="rtl:rotate-180" />}
                  </SubmitButton>
                </div>
              </div>
            </form>
          </main>
        </div>
      </div>
    </FormProvider>
  )
}
