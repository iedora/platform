"use client"

import { getFormProps, getInputProps, useForm } from "@conform-to/react"
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4"
import { Button } from "@iedora/ui/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@iedora/ui/components/ui/card"
import { PasswordField, TextField } from "@iedora/ui/components/field"
import Link from "next/link"
import { useActionState, useEffect, useState } from "react"

import { signUpAction } from "./actions.ts"
import { PASSWORD_MIN, signUpSchema } from "./schemas.ts"

export function SignUpForm({ next, signInHref }: { next: string; signInHref: string }) {
  const [lastResult, action, pending] = useActionState(signUpAction, undefined)

  const redirecting = lastResult?.status === "success"
  useEffect(() => {
    if (redirecting) window.location.assign(next)
  }, [redirecting, next])

  const [form, fields] = useForm({
    lastResult,
    constraint: getZodConstraint(signUpSchema),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: signUpSchema }),
  })

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const { key: nameKey, ...nameProps } = getInputProps(fields.name, {
    type: "text",
    value: false,
    ariaAttributes: false,
  })
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
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>One iedora account for every product.</CardDescription>
      </CardHeader>
      <CardContent>
        <form {...getFormProps(form)} action={action} className="flex flex-col gap-5">
          <input type="hidden" name="next" value={next} />
          <TextField
            key={nameKey}
            {...nameProps}
            label="Name"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={fields.name.errors?.[0]}
          />
          <TextField
            key={emailKey}
            {...emailProps}
            label="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            error={fields.email.errors?.[0]}
          />
          <PasswordField
            key={pwKey}
            {...pwProps}
            label="Password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={fields.password.errors ? undefined : `At least ${PASSWORD_MIN} characters`}
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
            {pending || redirecting ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href={signInHref} className="font-medium text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
