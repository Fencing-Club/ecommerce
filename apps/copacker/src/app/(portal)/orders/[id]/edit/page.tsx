import { OrderBuilder } from "@/components/order-builder"
export default function EditOrder({ page }: { page: React.ComponentProps<typeof OrderBuilder> }) {
  return <OrderBuilder {...page} />
}
