import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm } from "react-hook-form"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import { z } from "zod"
import preview from "#.storybook/preview"
import { useFormErrorMap } from "@/hooks/use-error-text"
import { companySchema, personSchema, placeSchema, type WorkspaceKind } from "@/lib/onboarding"
import { blankWizard } from "@/stories/fixtures/auth"
import { chooseOption } from "@/stories/play"
import {
  AboutFields,
  AddressStepFields,
  CompanyFields,
  RoleFields,
  useStepHeading,
  type WizardStep
} from "./wizard-steps"

// What the wizard checks, as onboarding-wizard.tsx builds it.
const schema = z.object({
  person: personSchema,
  kind: z.string().min(1, "onboarding.wizard.chooseRole"),
  company: companySchema,
  address: placeSchema
})
type Values = z.input<typeof schema>

// One step inside a form of its own, under its heading. Submitting checks the whole form and passes on what's in it.
function Step({
  step,
  kind,
  initial = blankWizard(),
  onSubmit
}: {
  step: WizardStep
  kind: WorkspaceKind | ""
  initial?: Values
  onSubmit: (values: Values) => void
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema, { error: useFormErrorMap() }),
    defaultValues: initial,
    mode: "onTouched"
  })
  const { title, description } = useStepHeading(step, kind)
  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void form.trigger().then(() => onSubmit(form.getValues()))
        }}
        className="flex max-w-md flex-col gap-6"
      >
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p>{description}</p>}
        {step === "about" && <AboutFields />}
        {step === "role" && <RoleFields />}
        {step === "company" && <CompanyFields kind={kind} />}
        {step === "address" && <AddressStepFields kind={kind} />}
        <Button type="submit">Continue</Button>
      </form>
    </FormProvider>
  )
}

const about: React.ComponentProps<typeof Step> = { step: "about", kind: "", onSubmit: fn() }

const meta = preview.meta({
  title: "Components/Onboarding/Wizard steps",
  component: Step,
  args: about
})

export const About = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "About you" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByText("Enter your first name")).toBeVisible()
    await expect(canvas.getByText("Enter your last name")).toBeVisible()
    await expect(canvas.getByText("Choose your position")).toBeVisible()
    await userEvent.type(canvas.getByLabelText(/First name/), "Alex")
    await userEvent.type(canvas.getByLabelText(/Last name/), "Rivera")
    await chooseOption(canvas.getByRole("combobox", { name: /Position/ }), "Purchasing manager")
    await expect(canvas.getByRole("combobox", { name: /Position/ })).toHaveTextContent("Purchasing manager")
    await waitFor(() => expect(canvas.queryByText("Choose your position")).toBeNull())
    await expect(canvas.queryByText("Enter your first name")).toBeNull()
  }
})

export const AboutFilled = meta.story({
  args: { initial: blankWizard({ firstName: "Jordan", lastName: "Lee", position: "Buyer" }) },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByLabelText(/First name/)).toHaveValue("Jordan")
    await expect(canvas.getByRole("combobox", { name: /Position/ })).toHaveTextContent("Buyer")
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ person: { firstName: "Jordan", lastName: "Lee", position: "Buyer" } })
      )
    )
  }
})

// The three kinds as cards: a click picks one, arrow keys move between them, and Enter continues.
export const Role = meta.story({
  args: { step: "role" },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("heading", { name: "What does your company do?" })).toBeVisible()
    await expect(canvas.getByText("Make products and fill purchase orders")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByText("Choose one")).toBeVisible()
    await userEvent.click(canvas.getByText("Supplier"))
    await expect(canvas.getByRole("radio", { name: /Supplier/ })).toBeChecked()
    // Picking one clears the error at once, as choosing a position does.
    await waitFor(() => expect(canvas.queryByText("Choose one")).toBeNull())
    await userEvent.keyboard("{ArrowDown}")
    await expect(canvas.getByRole("radio", { name: /Freight forwarder/ })).toBeChecked()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(args.onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "forwarder" })))
    await expect(canvas.queryByText("Choose one")).toBeNull()
  }
})

// A buyer's company has no phone number: nobody sees it.
export const CompanyBuyer = meta.story({
  args: { step: "company", kind: "buyer" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Your company" })).toBeVisible()
    await expect(canvas.queryByLabelText(/Phone number/)).toBeNull()
    await expect(canvas.getByLabelText(/Website/)).toHaveAttribute("placeholder", "example.com")
    await userEvent.type(canvas.getByLabelText(/Company name/), "H")
    await userEvent.type(canvas.getByLabelText(/Website/), "fencing")
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByText("Enter your company’s name")).toBeVisible()
    await expect(canvas.getByText("Enter a website, such as example.com")).toBeVisible()
    await userEvent.type(canvas.getByLabelText(/Company name/), "arbor Goods")
    await userEvent.clear(canvas.getByLabelText(/Website/))
    await userEvent.type(canvas.getByLabelText(/Website/), "harborgoods.example.com")
    await userEvent.tab()
    await expect(canvas.getByLabelText(/Website/)).toHaveValue("harborgoods.example.com")
    await expect(canvas.getByText("https://")).toBeVisible()
    await waitFor(() => expect(canvas.queryByText("Enter a website, such as example.com")).toBeNull())
    await expect(canvas.queryByText("Enter your company’s name")).toBeNull()
  }
})

// Buyers see a supplier's phone number, so a supplier gives one.
export const CompanySupplier = meta.story({
  args: { step: "company", kind: "supplier" },
  play: async ({ canvas }) => {
    const phone = canvas.getByLabelText(/Phone number/)
    await expect(phone).toHaveAttribute("type", "tel")
    await userEvent.type(phone, "call us")
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByText("Enter a phone number")).toBeVisible()
  }
})

export const AddressBuyer = meta.story({
  args: { step: "address", kind: "buyer" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Delivery address" })).toBeVisible()
    await expect(canvas.getByText("Where purchase orders are delivered")).toBeVisible()
    // The phone number is optional for a buyer: no star.
    await expect(canvas.getByText("Phone number").textContent).toBe("Phone number")
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByText("Name this address")).toBeVisible()
    await expect(canvas.getAllByText("Fill in this field").length).toBeGreaterThanOrEqual(5)
  }
})

// Amazon needs a pickup phone number for a supplier's address.
export const AddressSupplier = meta.story({
  args: { step: "address", kind: "supplier" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Pickup address" })).toBeVisible()
    await expect(canvas.getByText("Where carriers collect your cartons")).toBeVisible()
    await expect(canvas.getByText("Phone number").textContent).toBe("Phone number*")
  }
})

export const AddressForwarder = meta.story({
  args: { step: "address", kind: "forwarder" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Warehouse address" })).toBeVisible()
    await expect(canvas.getByText("Where buyers send goods for you")).toBeVisible()
  }
})

// Without a kind yet, the address step has a plain title.
export const AddressWithoutKind = meta.story({
  args: { step: "address", kind: "" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Address" })).toBeVisible()
    await expect(canvas.getByLabelText(/Address name/)).toBeVisible()
    await chooseOption(canvas.getByRole("combobox", { name: /Country/ }), "Canada")
    await expect(canvas.getByRole("combobox", { name: /Country/ })).toHaveTextContent("Canada")
  }
})
