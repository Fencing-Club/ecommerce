import { OrderBuilder } from "@/components/order-builder"
export default function NewOrder({ page }: { page: React.ComponentProps<typeof OrderBuilder> }) {
  return <OrderBuilder {...page} />
}
