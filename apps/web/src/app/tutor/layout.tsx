import { Toaster } from "@iedora/product-tutor/components/toaster"

// The tutor surface. Marks the subtree for per-surface theming (inherits the
// shared tutor base today; override under `[data-surface="tutor"]` in globals.css
// to diverge later). `display:contents` adds no box — custom props still inherit.
// Theme + fonts come from the platform root layout; this adds tutor's Toaster
// (sonner) so its server actions can surface toasts.
export default function TutorSurfaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="tutor" className="contents">
      {children}
      <Toaster />
    </div>
  )
}
