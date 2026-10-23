import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

// The five status tones' surface: a soft fill with text in the tone's color. Info, success and warning are Tailwind
// palette colors, as shadcn has no token for them; destructive is shadcn's own pattern, its token at 10%. Warning's text
// is amber-800, since amber itself is too light to read, and neutral's the muted text. Status pills, change pills and
// the action bar's lead tile share it.
const toneSurface = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-400",
  success: "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-400",
  warning: "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300",
  destructive: "bg-destructive/10 dark:bg-destructive/20 text-destructive"
} as const

// Every status reads in one of five tones, the same label always in the same tone: warning when the viewer has to act,
// info while someone else is working on it, success when it's ready or done well, neutral when idle or filed, and
// destructive when it failed or is lost.
type StatusTone = keyof typeof toneSurface

const badgeVariants = cva(
  "focus-ring group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline"
      },
      // A status tone, in place of a variant: the tone's surface, without an outline.
      tone: {
        neutral: ["border-0", toneSurface.neutral],
        info: ["border-0", toneSurface.info],
        success: ["border-0", toneSurface.success],
        warning: ["border-0", toneSurface.warning],
        destructive: ["border-0", toneSurface.destructive]
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)

// A badge in a variant, or in a status tone with `tone`.
function Badge({
  className,
  variant = "default",
  tone,
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants(tone ? { variant: null, tone } : { variant }), className)
      },
      props
    ),
    render,
    state: tone ? { slot: "badge", tone } : { slot: "badge", variant }
  })
}

export { Badge, badgeVariants, toneSurface, type StatusTone }
