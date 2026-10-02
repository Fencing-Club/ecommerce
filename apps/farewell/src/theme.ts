import { loadFont as loadFell } from "@remotion/google-fonts/IMFellEnglish"
import { loadFont as loadFellCaps } from "@remotion/google-fonts/IMFellEnglishSC"
import { loadFont as loadFellCanon } from "@remotion/google-fonts/IMFellFrenchCanon"
import { loadFont as loadSans } from "@remotion/google-fonts/NotoSans"
import { loadFont as loadScript } from "@remotion/google-fonts/PinyonScript"
import { loadFont as loadChalk } from "@remotion/google-fonts/Schoolbell"
import { loadFont as loadTypewriter } from "@remotion/google-fonts/SpecialElite"
import { loadFont as loadPoster } from "@remotion/google-fonts/Ultra"
import { loadFont as loadGothic } from "@remotion/google-fonts/UnifrakturMaguntia"

const latin = { weights: ["400" as const], subsets: ["latin" as const] }
loadFell("italic", latin)

// Victorian book and playbill type for the theatre, chalk for Math Coach, and plain sans for anything on a screen.
export const font = {
  book: loadFell("normal", latin).fontFamily,
  caps: loadFellCaps("normal", latin).fontFamily,
  title: loadFellCanon("normal", latin).fontFamily,
  poster: loadPoster("normal", latin).fontFamily,
  script: loadScript("normal", latin).fontFamily,
  chalk: loadChalk("normal", latin).fontFamily,
  typewriter: loadTypewriter("normal", latin).fontFamily,
  gothic: loadGothic("normal", latin).fontFamily,
  sans: loadSans("normal", { weights: ["400", "600", "700"], subsets: ["latin"] }).fontFamily
}

// The ink every cut-out is outlined in.
export const ink = "#2b1b10"

export const paper = { light: "#f7ecd3", base: "#efdfbd", shade: "#d9c194", dark: "#a98b58" }
export const velvet = { light: "#c8383d", base: "#9a1b21", dark: "#5c0b10", deep: "#360407" }
export const gold = { light: "#fbe39a", base: "#d8a947", dark: "#8c6219", deep: "#553a0a" }
export const wood = { light: "#bd854d", base: "#8a582a", dark: "#5a3818", deep: "#36200b" }
export const skin = { base: "#f4cba3", shade: "#dca57a", blush: "#ef9a87" }

// Copilot's colours, blue round to pink.
export const copilot = ["#1d6ff2", "#1fb6cf", "#69d36a", "#ffc83d", "#ff7a45", "#f2559a"] as const

export const chalkboard = { board: "#2e4a3b", dark: "#1e3227", line: "#f3f1e4" }
