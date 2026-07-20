"use client"

import { Button } from "@iedora/ui/components/ui/button"
import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { signOut } from "../lib/auth-client"

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <Button
      variant="outline"
      size="lg"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await signOut()
        router.push("/sign-in")
        router.refresh()
      }}
    >
      <LogOut />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  )
}
