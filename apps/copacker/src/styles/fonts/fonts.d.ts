// Both build systems turn imported font files into their served asset URLs.
declare module "*.woff2" {
  const url: string
  export default url
}
declare module "*.ttf" {
  const source: string
  export default source
}
