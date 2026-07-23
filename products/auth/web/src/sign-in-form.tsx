"use client"

import { getFormProps, getInputProps, useForm } from "@conform-to/react"
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4"
import { Button } from "@iedora/ui/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@iedora/ui/components/ui/card"
import { PasswordField, TextField } from "@iedora/ui/components/field"
import Link from "next/link"
import { useActionState, useEffect, useState } from "react"

import { signInAction } from "./actions.ts"
import { signInSchema } from "./schemas.ts"

export function SignInForm({ next, signUpHref }: { next: string; signUpHref: string }) {
  const [lastResult, action, pending] = useActionState(signInAction, undefined)

  // On success the action has set the SSO cookies; do a full-page navigation (not
  // a soft router push) so the destination's first render always carries them.
  const redirecting = lastResult?.status === "success"
  useEffect(() => {
    if (redirecting) window.location.assign(next)
  }, [redirecting, next])

  const [form, fields] = useForm({
    lastResult,
    constraint: getZodConstraint(signInSchema),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: signInSchema }),
  })

  // Controlled so a failed sign-in keeps what the user typed (React 19 resets the
  // form action otherwise).
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const { key: emailKey, ...emailProps } = getInputProps(fields.email, {
    type: "email",
    value: false,
    ariaAttributes: false,
  })
  const { key: pwKey, ...pwProps } = getInputProps(fields.password, {
    type: "password",
    value: false,
    ariaAttributes: false,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your iedora account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form {...getFormProps(form)} action={action} className="flex flex-col gap-5">
          <input type="hidden" name="next" value={next} />
          <TextField
            key={emailKey}
            {...emailProps}
            label="Email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            error={fields.email.errors?.[0]}
          />
          <PasswordField
            key={pwKey}
            {...pwProps}
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fields.password.errors?.[0]}
            showLabel="Show password"
            hideLabel="Hide password"
          />
          {form.errors && (
            <p className="text-[13px] text-destructive" role="alert">
              {form.errors[0]}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={pending || redirecting}>
            {pending || redirecting ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href={signUpHref} className="font-medium text-primary underline-offset-4 hover:underline">
              Sign up
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
