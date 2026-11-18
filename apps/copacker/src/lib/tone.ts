// The five status tones' surface: a soft fill with text in the tone's color. Info, success and warning are Tailwind
// palette colors, as shadcn has no token for them; destructive is shadcn's own pattern, its token at 10%. Warning's text
// is amber-800, since amber itself is too light to read, and neutral's the muted text. Status pills, change pills and
// the action bar's lead tile share it.
export const toneSurface = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-400",
  success: "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-400",
  warning: "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300",
  destructive: "bg-destructive/10 dark:bg-destructive/20 text-destructive"
} as const

// Every status reads in one of five tones, the same label always in the same tone: warning when the viewer has to act,
// info while someone else is working on it, success when it's ready or done well, neutral when idle or filed, and
// destructive when it failed or is lost.
export type StatusTone = keyof typeof toneSurface

// A badge in a status tone, on shadcn's secondary Badge: the tone's surface, without an outline.
export const toneBadge = (tone: StatusTone) => ["border-0", toneSurface[tone]]
