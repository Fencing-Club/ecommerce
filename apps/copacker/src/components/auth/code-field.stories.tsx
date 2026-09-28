import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm } from "react-hook-form"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { codeSchema } from "@/lib/sign-in"
import { CodeField } from "./code-field"

// The field inside a form of its own, checked as the verify-email page checks it.
function CodeForm({
  code = "",
  onComplete,
  onSubmit
}: {
  code?: string
  onComplete: (code: string) => void
  onSubmit: (values: { code: string }) => void
}) {
  const form = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code } })
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex max-w-sm flex-col gap-4">
        <CodeField name="code" label="Verification code" onComplete={onComplete} />
        <Button type="submit">Verify email</Button>
      </form>
    </FormProvider>
  )
}

// The six boxes, as they show each digit.
function boxes(canvasElement: HTMLElement) {
  return [...canvasElement.querySelectorAll("[aria-hidden] > span.flex-1")].map((box) => box.textContent)
}

const meta = preview.meta({
  component: CodeForm,
  args: { onComplete: fn(), onSubmit: fn() }
})

export const Empty = meta.story({
  play: async ({ canvas, canvasElement, args }) => {
    const input = canvas.getByLabelText("Verification code")
    await expect(input).toHaveAttribute("autocomplete", "one-time-code")
    await expect(input).toHaveAttribute("inputmode", "numeric")
    await expect(boxes(canvasElement)).toEqual(["", "", "", "", "", ""])
    await expect(args.onComplete).not.toHaveBeenCalled()
  }
})

// Each digit lands in the next box; the sixth completes the code.
export const Typing = meta.story({
  play: async ({ canvas, canvasElement, args }) => {
    const input = canvas.getByLabelText("Verification code")
    await userEvent.click(input)
    await userEvent.keyboard("123")
    await expect(boxes(canvasElement)).toEqual(["1", "2", "3", "", "", ""])
    await expect(args.onComplete).not.toHaveBeenCalled()
    await userEvent.keyboard("456")
    await expect(input).toHaveValue("123456")
    await expect(boxes(canvasElement)).toEqual(["1", "2", "3", "4", "5", "6"])
    await expect(args.onComplete).toHaveBeenCalledOnce()
    await expect(args.onComplete).toHaveBeenCalledWith("123456")
    // A seventh digit doesn't fit.
    await userEvent.keyboard("7")
    await expect(input).toHaveValue("123456")
    await userEvent.keyboard("{Backspace}")
    await expect(boxes(canvasElement)).toEqual(["1", "2", "3", "4", "5", ""])
  }
})

// Letters and spaces are dropped as they're typed.
export const DigitsOnly = meta.story({
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText("Verification code")
    await userEvent.type(input, "1a2 b3")
    await expect(input).toHaveValue("123")
  }
})

// A pasted code completes at once.
export const Pasting = meta.story({
  play: async ({ canvas, canvasElement, args }) => {
    const input = canvas.getByLabelText("Verification code")
    await userEvent.click(input)
    await userEvent.paste("482913")
    await expect(input).toHaveValue("482913")
    await expect(boxes(canvasElement)).toEqual(["4", "8", "2", "9", "1", "3"])
    await expect(args.onComplete).toHaveBeenCalledOnce()
    await expect(args.onComplete).toHaveBeenCalledWith("482913")
  }
})

export const PastingTooMuch = meta.story({
  play: async ({ canvas, args }) => {
    const input = canvas.getByLabelText("Verification code")
    await userEvent.click(input)
    await userEvent.paste("12345678")
    await expect(input).toHaveValue("123456")
    await expect(args.onComplete).toHaveBeenCalledWith("123456")
  }
})

export const Incomplete = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.type(canvas.getByLabelText("Verification code"), "1234")
    await userEvent.click(canvas.getByRole("button", { name: "Verify email" }))
    await expect(await canvas.findByText("Enter the 6-digit code")).toBeVisible()
    await expect(canvas.getByLabelText("Verification code")).toHaveAttribute("aria-invalid", "true")
    await expect(args.onSubmit).not.toHaveBeenCalled()
    await userEvent.type(canvas.getByLabelText("Verification code"), "56")
    await waitFor(() => expect(canvas.queryByText("Enter the 6-digit code")).toBeNull())
  }
})

export const Prefilled = meta.story({
  args: { code: "123456" },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(boxes(canvasElement)).toEqual(["1", "2", "3", "4", "5", "6"])
    await userEvent.click(canvas.getByRole("button", { name: "Verify email" }))
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledWith({ code: "123456" }, expect.anything()))
  }
})
