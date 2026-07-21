"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

export function Toaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-center"
      // Sits below the notch when installed to the home screen.
      offset="calc(env(safe-area-inset-top) + 12px)"
      toastOptions={{ className: "font-sans" }}
    />
  )
}
