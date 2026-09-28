import { redirect } from "next/navigation"

// Suppliers are listed with the other partners.
export default function SuppliersPage() {
  redirect("/partners?type=supplier")
}
