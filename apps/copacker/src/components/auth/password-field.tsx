import { Check, Eye, EyeOff } from "lucide-react"
import { useId, useState } from "react"
import { useWatch } from "react-hook-form"
import { useTranslations } from "use-intl"
import { FormField, fieldControl, useFormField } from "@/components/form-controls"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { passwordMinimum } from "@/lib/sign-in"
import { cn } from "@/lib/utils"

// A password, bound to the surrounding form by `name`, with a button that shows it. `action` sits across from the
// label, such as "Forgot password?". A new password lists the one rule WorkOS states, ticking it once it's met.
export function PasswordField({
  name,
  label,
  autoComplete,
  action,
  isNew = false
}: {
  name: string
  label: string
  autoComplete: "current-password" | "new-password"
  action?: React.ReactNode
  isNew?: boolean
}) {
  const t = useTranslations("auth.fields")
  const ruleId = useId()
  const [visible, setVisible] = useState(false)
  const {
    field: { ref, value, onChange, onBlur, name: fieldName },
    error,
    fieldProps
  } = useFormField(name)
  const typed = useWatch({ name })
  const long = typeof typed === "string" && typed.length >= passwordMinimum
  // The rule, until the error that restates it takes its place.
  const showsRule = isNew && !error
  return (
    <FormField {...fieldProps} label={label} labelAction={action}>
      <InputGroup className="h-10">
        <InputGroupInput
          {...fieldControl(fieldProps.id, { error, describedBy: showsRule ? ruleId : undefined })}
          ref={ref}
          name={fieldName}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value ?? ""}
          onChange={onChange}
          onBlur={onBlur}
          spellCheck={false}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={t("showPassword")}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {showsRule && (
        <p
          id={ruleId}
          className={cn(
            "flex items-center gap-1.5 text-xs transition-colors",
            long ? "text-green-800 dark:text-green-400" : "text-muted-foreground"
          )}
        >
          <Check className={cn("size-3.5 transition-opacity", long ? "opacity-100" : "opacity-40")} aria-hidden />
          {t("passwordRule", { count: passwordMinimum })}
        </p>
      )}
    </FormField>
  )
}
