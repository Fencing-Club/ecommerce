import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { SignedInAs } from "./signed-in-as"

// Where the sign-out form would post, caught before the browser leaves the story.
const posted = fn()

function catchSubmit() {
  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    if (event.target instanceof HTMLFormElement) {
      posted(event.target.getAttribute("action"), event.target.method)
    }
  }
  document.addEventListener("submit", submit, true)
  return () => document.removeEventListener("submit", submit, true)
}

const meta = preview.meta({
  component: SignedInAs,
  args: { email: "alex@example.com" },
  beforeEach: catchSubmit
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("alex@example.com")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Sign out" }))
    await expect(posted).toHaveBeenCalledWith("/logout", "post")
  }
})

// A phone keeps just the button.
export const Phone = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("alex@example.com")).not.toBeVisible()
    await expect(canvas.getByRole("button", { name: "Sign out" })).toBeVisible()
  }
})

export const LongEmail = meta.story({
  args: { email: "alexandra.rivera-montgomery@operations.harborgoods.example.com" },
  render: (args) => (
    <div className="w-72">
      <SignedInAs {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const email = canvas.getByText("alexandra.rivera-montgomery@operations.harborgoods.example.com")
    await expect(email).toHaveClass("truncate")
    await expect(email.scrollWidth).toBeGreaterThan(email.clientWidth)
    await expect(canvas.getByRole("button", { name: "Sign out" })).toBeVisible()
  }
})
