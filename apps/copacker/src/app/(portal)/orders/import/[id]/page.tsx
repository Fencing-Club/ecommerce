import { ImportReview } from "@/components/import-review"
export default function ReviewImport({ page }: { page: React.ComponentProps<typeof ImportReview> }) {
  return <ImportReview {...page} />
}
