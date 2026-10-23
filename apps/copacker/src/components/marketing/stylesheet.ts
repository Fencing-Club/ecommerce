// The marketing pages' stylesheet, which each page's component imports: Tailwind with the kit's stylesheet, then the
// theme's colors, which override the kit's defaults. The app's layouts bring the same files (AppProviders), so the
// browser downloads them once either way.
import "@/app/globals.css"
import "@/styles/theme.css"
