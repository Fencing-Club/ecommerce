// Up to two capitals for an avatar or a workspace's tile: the first letter or digit of each of a name's first two words,
// such as "LM" for Lotus Manufacturing. Punctuation is skipped, so "(Acme) Co" is "AC".
export function initials(name: string) {
  return name
    .split(/\s+/)
    .flatMap((word) => Array.from(word.replace(/[^\p{L}\p{N}]/gu, "")).slice(0, 1))
    .slice(0, 2)
    .join("")
    .toUpperCase()
}
