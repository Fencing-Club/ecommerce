import { FormProvider, useForm } from "react-hook-form"
import type { OrderForm } from "@/lib/order-form"
import { order } from "./fixtures/purchase-orders"

// The purchase order editor's form around a piece of it, for that piece's stories: PO-1042 to the buyer's warehouse
// unless `values` says otherwise.
export function OrderFormStory({ values, children }: { values?: Partial<OrderForm>; children: React.ReactNode }) {
  const form = useForm<OrderForm>({ defaultValues: { ...order, destination: "warehouse", ...values } })
  return <FormProvider {...form}>{children}</FormProvider>
}
