"use client"

import { useRouter } from "next/navigation"
import { AddPartner } from "@/components/add-partner"

export function PartnerCreation() {
  const router = useRouter()
  return <AddPartner onCreated={router.refresh} />
}
