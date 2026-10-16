import { useRouter } from "@tanstack/react-router"
import { AddPartner } from "@/components/add-partner"

export function PartnerCreation() {
  const router = useRouter()
  return <AddPartner onCreated={router.invalidate} />
}
