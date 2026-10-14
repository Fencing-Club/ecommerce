"use client"

import { useLocale, useTranslations } from "next-intl"
import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { amazonMarketplaces } from "@/lib/amazon-marketplaces"
import { countriesIn } from "@/lib/countries"
import { FormLabel } from "./form-controls"
import { SelectControl } from "./form-select"

export function AmazonConnect({ className, children }: { className?: string; children: React.ReactNode }) {
  const t = useTranslations("settings.integrations.amazonConnect")
  const id = useId()
  const [marketplace, setMarketplace] = useState("US")
  const countries = countriesIn(useLocale())
  const options = amazonMarketplaces.map((value) => ({
    value,
    label: countries.find((country) => country.value === value)?.label ?? value
  }))
  return (
    <Dialog>
      <DialogTrigger className={className}>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form method="get" action="/api/connections/amazon" className="grid gap-5">
          <Field>
            <FormLabel htmlFor={id} label={t("marketplace")} required />
            <SelectControl
              id={id}
              name="marketplace"
              options={options}
              value={marketplace}
              onValueChange={(value) => setMarketplace(value ?? "US")}
              required
            />
          </Field>
          <DialogFooter>
            <Button type="submit">{t("continue")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
