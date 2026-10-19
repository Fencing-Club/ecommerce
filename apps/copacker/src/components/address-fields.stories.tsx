import { zodResolver } from "@hookform/resolvers/zod"
import { addressSchema, originSchema } from "@repo/aisle"
import { FormProvider, useForm } from "react-hook-form"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import { z } from "zod"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { useFormErrorMap } from "@/hooks/use-error-text"
import { AddressFields, emptyAddress } from "./address-fields"

type Address = typeof emptyAddress

// The fields in a form as the onboarding and shipment pages have them: an address at `address`, checked with the
// shared address schema (or the origin schema, which needs a phone for Amazon's pickup).
function AddressForm({
  requirePhone = false,
  address,
  onSubmit
}: {
  requirePhone?: boolean
  address: Address
  onSubmit: (values: unknown) => void
}) {
  const schema = requirePhone ? originSchema : addressSchema
  const form = useForm({
    resolver: zodResolver(z.object({ address: schema }), { error: useFormErrorMap() }),
    defaultValues: { address }
  })
  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-2xl flex-col gap-4">
        <AddressFields path="address" requirePhone={requirePhone} />
        <div>
          <Button type="submit">Save address</Button>
        </div>
      </form>
    </FormProvider>
  )
}

const meta = preview.meta({
  title: "Components/Forms/Address fields",
  component: AddressForm,
  args: { requirePhone: false, address: emptyAddress, onSubmit: fn() }
})

const filled: Address = {
  name: "Mei Chen",
  phoneNumber: "+86 574 8765 4321",
  email: "mei@lotus.example.com",
  addressLine1: "88 Harbor Road",
  addressLine2: "Building 3",
  city: "Ningbo",
  stateOrRegion: "Zhejiang",
  postalCode: "315000",
  countryCode: "CN"
}

export const Empty = meta.story({
  play: async ({ canvas, args }) => {
    // Fixture previews have no Maps key. Manual entry must remain usable while the live SDK loads or is unavailable.
    await expect(canvas.getByLabelText(/Street address/)).toBeEnabled()
    await expect(canvas.getByLabelText(/City/)).toBeEnabled()
    await userEvent.click(canvas.getByRole("button", { name: "Save address" }))
    // Each required field says so; the optional ones don't.
    await waitFor(() => expect(canvas.getAllByText("Fill in this field")).toHaveLength(5))
    await expect(canvas.getByText("Choose a country", { selector: "[role=alert]" })).toBeVisible()
    await expect(canvas.getByLabelText(/Contact name/)).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByLabelText(/Phone number/)).not.toHaveAttribute("aria-invalid", "true")
    await expect(args.onSubmit).not.toHaveBeenCalled()
  }
})

export const FillIn = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.type(canvas.getByLabelText(/Contact name/), "Alex Rivera")
    await userEvent.type(canvas.getByLabelText(/Street address/), "400 Pier Avenue")
    await userEvent.type(canvas.getByLabelText(/City/), "Oakland")
    await userEvent.type(canvas.getByLabelText(/Postal code/), "94607")
    const country = canvas.getByRole("combobox", { name: /Country/ })
    await expect(country).toHaveTextContent("Choose a country")
    await userEvent.click(country)
    await userEvent.click(await screen.findByRole("option", { name: "United States" }))
    await userEvent.click(canvas.getByRole("combobox", { name: /State or province/ }))
    await userEvent.click(await screen.findByRole("option", { name: "California" }))
    await expect(country).toHaveTextContent("United States")
    await userEvent.click(canvas.getByRole("button", { name: "Save address" }))
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledOnce())
    await expect(args.onSubmit).toHaveBeenCalledWith(
      {
        address: {
          name: "Alex Rivera",
          phoneNumber: "",
          email: "",
          addressLine1: "400 Pier Avenue",
          addressLine2: "",
          city: "Oakland",
          stateOrRegion: "CA",
          postalCode: "94607",
          countryCode: "US"
        }
      },
      expect.anything()
    )
  }
})

export const Filled = meta.story({
  args: { address: filled },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText(/Contact name/)).toHaveValue("Mei Chen")
    await expect(canvas.getByLabelText(/Address line 2/)).toHaveValue("Building 3")
    const country = canvas.getByRole("combobox", { name: /Country/ })
    await expect(country).toHaveTextContent("China")
    await userEvent.click(country)
    await userEvent.click(await screen.findByRole("option", { name: "Canada" }))
    await expect(country).toHaveTextContent("Canada")
  }
})

export const InternationalPhone = meta.story({
  args: { address: { ...filled, countryCode: "US", phoneNumber: "" } },
  play: async ({ canvas }) => {
    const phone = canvas.getByLabelText(/Phone number/)
    await userEvent.type(phone, "4252602501")
    await userEvent.tab()
    await expect(phone).toHaveValue("+1 (425) 260-2501")
    await userEvent.clear(phone)
    await userEvent.type(phone, "+442071838750")
    await userEvent.tab()
    await expect(phone).toHaveValue("+44 20 7183 8750")
  }
})

export const RegionsFollowCountry = meta.story({
  args: { address: { ...filled, countryCode: "US", stateOrRegion: "CA" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: /State or province/ })).toHaveTextContent("California")
    await userEvent.click(canvas.getByRole("combobox", { name: /Country/ }))
    await userEvent.click(await screen.findByRole("option", { name: "Canada" }))
    const region = canvas.getByRole("combobox", { name: /State or province/ })
    await expect(region).not.toHaveTextContent("California")
    await userEvent.click(region)
    await expect(screen.queryByRole("option", { name: "California" })).toBeNull()
    await userEvent.click(await screen.findByRole("option", { name: "Ontario" }))
    await expect(region).toHaveTextContent("Ontario")
  }
})

// An address saved before the country menu may hold a code the list lacks; it shows as saved until changed.
export const UnlistedCountryCode = meta.story({
  args: { address: { ...filled, countryCode: "UK" } },
  play: async ({ canvas, args }) => {
    const country = canvas.getByRole("combobox", { name: /Country/ })
    await expect(country).toHaveTextContent("UK")
    await userEvent.click(country)
    await expect(await screen.findByRole("option", { name: "UK" })).toBeVisible()
    await expect(screen.getByRole("option", { name: "United Kingdom" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("option", { name: "UK" }))
    await expect(country).toHaveTextContent("UK")
    // Picking a listed country replaces it.
    await userEvent.click(country)
    await userEvent.click(await screen.findByRole("option", { name: "United Kingdom" }))
    await expect(country).toHaveTextContent("United Kingdom")
    await userEvent.type(canvas.getByLabelText(/State or province/), "Zhejiang")
    await userEvent.click(canvas.getByRole("button", { name: "Save address" }))
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({ address: { ...filled, countryCode: "GB" } }, expect.anything())
    )
  }
})

// A shipment's origin needs a phone number for Amazon's pickup.
export const PhoneRequired = meta.story({
  args: { requirePhone: true, address: { ...filled, phoneNumber: "" } },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save address" }))
    const phone = canvas.getByLabelText(/Phone number/)
    await waitFor(() => expect(phone).toHaveAttribute("aria-invalid", "true"))
    await expect(phone).toBeRequired()
    await expect(args.onSubmit).not.toHaveBeenCalled()
    await userEvent.type(phone, "+86 574 8765 4321")
    await userEvent.click(canvas.getByRole("button", { name: "Save address" }))
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledOnce())
  }
})
