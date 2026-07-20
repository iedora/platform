"use client"

import { GraduationCap } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { completeOAuthAction } from "../actions"

/**
 * Where the auth service redirects after an OAuth provider (Google, …) sign-in.
 * The tokens arrive in the URL FRAGMENT (never sent to a server), so we read them
 * here, hand them to a server action that verifies + sets the session cookies,
 * then scrub the fragment and continue.
 */
export default function OAuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""))
    const accessToken = params.get("access_token")
    const refreshToken = params.get("refresh_token")
    // Scrub tokens from the address bar immediately.
    window.history.replaceState(null, "", window.location.pathname)

    if (!accessToken || !refreshToken) {
      setError("Sign-in was cancelled or the link expired.")
      return
    }
    completeOAuthAction(accessToken, refreshToken).then((res) => {
      if (res.error) setError(res.error.message)
      else router.replace("/chat")
    })
  }, [router])

  return (
    <div className="grid min-h-svh place-items-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
          <GraduationCap className="size-6" />
        </span>
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <a href="/sign-in" className="text-sm underline">
              Back to sign in
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        )}
      </div>
    </div>
  )
}
