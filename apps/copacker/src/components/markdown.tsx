import ReactMarkdown from "react-markdown"
import { cn } from "@/lib/utils"

function ImageDescription({ alt }: { alt?: string }) {
  return <>{alt}</>
}
const components = { img: ImageDescription }

// Shared presentation for buyer-written notes and packing instructions. Raw HTML is ignored;
// image descriptions remain readable without loading external images into an order.
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "min-w-0 space-y-2 whitespace-normal leading-relaxed [overflow-wrap:anywhere] [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-s-2 [&_blockquote]:ps-3 [&_code]:font-mono [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold [&_li+li]:mt-1 [&_li>p+p]:mt-2 [&_ol]:list-decimal [&_ol]:ps-5 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_ul]:list-disc [&_ul]:ps-5",
        className
      )}
    >
      <ReactMarkdown skipHtml components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
