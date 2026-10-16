import { AuthScreen } from "@/components/auth/auth-screen"
import type { AuthPageData } from "@/lib/auth-pages"

export default function Page({ page }: { page: AuthPageData }) {
  return <AuthScreen page={page} />
}
