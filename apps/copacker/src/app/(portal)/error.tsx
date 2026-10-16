import { PortalError } from "@/components/portal-error"

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <PortalError retry={retry} />
}
