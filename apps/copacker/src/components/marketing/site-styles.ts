// The two grounds: the paper, and the ink of the stages set into it.
export const paper = "light bg-(--paper) text-foreground [color-scheme:light]"
export const stage = "dark bg-(--ink) text-foreground [color-scheme:dark]"
// Secondary text. The theme's muted gray is set for white, and on the warmer paper it falls short of AA contrast.
export const quiet = "text-foreground/60"
// Copacker's orange, lit from above, as the ad's end card has it.
// The gradient only fills the words' box, so in Urdu the box reaches past the line to take in Nastaliq's tall letters.
export const lit =
  "bg-[linear-gradient(180deg,#ffb27a_0%,#ff7a2e_45%,#f54a00_100%)] bg-clip-text text-transparent urdu:-my-[0.9em] urdu:py-[0.9em]"
// Rises into place as the page loads, after its animation delay.
export const rise =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-[0.35em] motion-safe:duration-1000 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:fill-mode-both"
// Like rise, for the words a page opens with, but starting faint rather than hidden, so they show in the page's first
// frame: browsers time a page's largest paint by words like these, and don't count them while they're invisible.
export const lift =
  "motion-safe:animate-in motion-safe:fade-in-30 motion-safe:slide-in-from-bottom-[0.35em] motion-safe:duration-1000 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:fill-mode-both"
