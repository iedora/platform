// Marks the menu surface for per-surface theming. Every token override under
// `[data-surface="menu"]` in globals.css scopes to this subtree; today it
// inherits the shared (tutor) base, so menu looks like the base until customized.
// `display:contents` adds no box — custom properties still inherit through it.
export default function MenuSurfaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="menu" className="contents">
      {children}
    </div>
  )
}
