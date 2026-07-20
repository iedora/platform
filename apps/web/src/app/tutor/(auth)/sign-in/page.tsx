"use client"

import { Button } from "@iedora/ui/components/ui/button"
import { GraduationCap } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { signIn, signUp } from "@iedora/product-tutor/lib/auth-client"
import { oauthAuthorizeUrl } from "@iedora/product-tutor/lib/oauth-client"

export default function SignInPage() {
  const router = useRouter()
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const result =
      mode === "sign-in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name })
    setPending(false)
    if (result.error) {
      setError(result.error.message ?? "Something went wrong.")
      return
    }
    router.push("/chat")
  }

  return (
    <div className="grid min-h-svh place-items-center p-6">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-card p-6"
      >
        <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
          <GraduationCap className="size-6" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">
            {mode === "sign-in" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "sign-in"
              ? "Sign in to book and message your tutor."
              : "Start with a free 15-minute intro lesson."}
          </p>
        </div>

        {mode === "sign-up" && (
          <Field label="Name" value={name} onChange={setName} type="text" autoComplete="name" />
        )}
        <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" />
        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            window.location.href = oauthAuthorizeUrl("google")
          }}
        >
          Continue with Google
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {mode === "sign-in"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type: string
  autoComplete: string
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        required
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </label>
  )
}
