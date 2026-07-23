"use client"

import { Button } from "@iedora/ui/components/ui/button"
import { brandUrl } from "@iedora/brand"
import { LogOut } from "lucide-react"
import { useState } from "react"

import { logoutAction } from "@iedora/product-tutor/auth/actions"

export function SignOutButton() {
  const [pending, setPending] = useState(false)

  return (
    <Button
      variant="outline"
      size="lg"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await logoutAction()
        // Central sign-in is a cross-origin absolute URL — full navigation, not router.push.
        window.location.assign(`${brandUrl()}/sign-in`)
      }}
    >
      <LogOut />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  )
}
