import { useScrollProgress } from "./scroll"

// The hero's product shot leans back at first and straightens up as it scrolls into view, as if set down on the page.
export function Tilt({ children }: { children: React.ReactNode }) {
  const ref = useScrollProgress<HTMLDivElement>((box, height) => (height * 0.95 - box.top) / (height * 0.6))
  return (
    <div ref={ref} className="[perspective:2200px]">
      <div
        className="origin-top will-change-transform"
        style={{
          transform:
            "rotateX(calc((1 - var(--progress, 1)) * 16deg)) scale(calc(0.93 + var(--progress, 1) * 0.07)) translateY(calc((1 - var(--progress, 1)) * -1.5rem))"
        }}
      >
        {children}
      </div>
    </div>
  )
}
