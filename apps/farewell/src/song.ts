import { createContext } from "react"

// The song's clock in seconds, for anything on stage that follows the music. Outside the show, in the cast stills,
// there's none.
export const Song = createContext<number | undefined>(undefined)
