// Marks the house surface for per-surface theming — see the menu surface layout.
// Overrides go under `[data-surface="house"]` in globals.css; inherits the shared
// (tutor) base until customized.
export default function HouseSurfaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="house" className="contents">
      {children}
    </div>
  )
}
