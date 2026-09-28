// A font file imported from code is its URL (Turbopack's static assets).
declare module "*.woff2" {
  const url: string
  export default url
}
