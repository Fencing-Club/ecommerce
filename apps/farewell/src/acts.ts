import type { Card } from "./theatre"
import type { Part } from "./timeline"

// The card on the easel for each part of the show, named for a slogan of the decade.
export const cards: Record<Part, Card | undefined> = {
  overture: { title: ["Overture"] },
  act1: { kicker: "Act I", title: ["Hit Refresh"] },
  interval: { title: ["Interval", "(7 seconds)"] },
  act2: { kicker: "Act II", title: ["Cloud First"] },
  act3: { kicker: "Act III", title: ["AI First"] },
  act4: { kicker: "Act IV", title: ["Do Less"] },
  sincere: { kicker: "Interlude", title: ["Sincerely"] },
  act5: { kicker: "Act V", title: ["The People"] },
  finale: { kicker: "Finale", title: ["One", "Microsoft"] },
  epilogue: { kicker: "Epilogue", title: ["OOF"] },
  curtainCall: { title: ["Curtain", "Call"] },
  credits: undefined
}
