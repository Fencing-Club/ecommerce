import { OrderReviser } from "@/components/supplier/order-reviser"
export default function ReviseOrder({ page }: { page: React.ComponentProps<typeof OrderReviser> }) {
  return <OrderReviser {...page} />
}
