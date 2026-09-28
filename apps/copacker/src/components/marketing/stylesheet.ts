// The marketing pages' stylesheet, which each page's component imports: the reset first, since it declares the layer
// Tailwind's layers then override, then Tailwind. The app's layouts bring the same files (AppProviders), so the
// browser downloads them once either way.
import "@/styles/global.css"
import "@/app/globals.css"
