import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "./field"
import { Label } from "./label"
import { RadioGroup, RadioGroupItem } from "./radio-group"

const roles = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" }
]

const meta = preview.meta({
  title: "Foundations/Radio group",
  component: RadioGroup,
  args: { onValueChange: fn(), defaultValue: "member", "aria-label": "Role" },
  render: (args) => (
    <RadioGroup {...args} className="max-w-xs">
      {roles.map((role) => (
        <div key={role.value} className="flex items-center gap-2">
          <RadioGroupItem id={`role-${role.value}`} value={role.value} disabled={role.value === "owner"} />
          <Label htmlFor={`role-${role.value}`}>{role.label}</Label>
        </div>
      ))}
    </RadioGroup>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("radiogroup", { name: "Role" })).toBeVisible()
    const member = canvas.getByRole("radio", { name: "Member" })
    const admin = canvas.getByRole("radio", { name: "Admin" })
    await expect(member).toHaveAttribute("aria-checked", "true")

    await userEvent.click(admin)
    await expect(admin).toHaveAttribute("aria-checked", "true")
    await expect(member).toHaveAttribute("aria-checked", "false")
    await expect(args.onValueChange).toHaveBeenLastCalledWith("admin", expect.anything())

    // Clicking a label picks its radio.
    await userEvent.click(canvas.getByText("Member"))
    await expect(member).toHaveAttribute("aria-checked", "true")
    await expect(args.onValueChange).toHaveBeenLastCalledWith("member", expect.anything())
  }
})

export const Keyboard = meta.story({
  play: async ({ canvas, args }) => {
    const member = canvas.getByRole("radio", { name: "Member" })
    member.focus()
    // Arrow keys move the choice and skip the disabled owner.
    await userEvent.keyboard("{ArrowUp}")
    const admin = canvas.getByRole("radio", { name: "Admin" })
    await expect(admin).toHaveFocus()
    await expect(admin).toHaveAttribute("aria-checked", "true")
    await userEvent.keyboard("{ArrowUp}")
    await expect(member).toHaveFocus()
    await expect(args.onValueChange).toHaveBeenLastCalledWith("member", expect.anything())
  }
})

export const DisabledItem = meta.story({
  play: async ({ canvas, args }) => {
    const owner = canvas.getByRole("radio", { name: "Owner" })
    await expect(owner).toHaveAttribute("aria-disabled", "true")
    await userEvent.click(canvas.getByText("Owner"))
    await expect(owner).toHaveAttribute("aria-checked", "false")
    await expect(args.onValueChange).not.toHaveBeenCalled()
  }
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    for (const radio of canvas.getAllByRole("radio")) {
      await expect(radio).toHaveAttribute("aria-disabled", "true")
    }
    await userEvent.click(canvas.getByText("Admin"))
    await expect(args.onValueChange).not.toHaveBeenCalled()
  }
})

// Choice cards with descriptions, as the invitation and team settings lay them out.
export const ChoiceCards = meta.story({
  render: (args) => (
    <RadioGroup {...args} className="max-w-sm">
      {roles.slice(1).map((role) => (
        <FieldLabel key={role.value} htmlFor={`card-${role.value}`}>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>{role.label}</FieldTitle>
              <FieldDescription>
                {role.value === "admin" ? "Manages the team and every page." : "Opens the pages you choose."}
              </FieldDescription>
            </FieldContent>
            <RadioGroupItem id={`card-${role.value}`} value={role.value} />
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  ),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByText("Manages the team and every page."))
    await expect(canvas.getAllByRole("radio")[0]).toHaveAttribute("aria-checked", "true")
    await expect(args.onValueChange).toHaveBeenLastCalledWith("admin", expect.anything())
  }
})
