"use client"

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js"
import { Button } from "@iedora/ui/components/ui/button"
import { Lock } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { haptic } from "@iedora/product-tutor/lib/haptics"
import { confirmCardSetup, startCardSetup } from "../payments.actions"

// Stripe.js is heavy and only needed once someone opens the card form. This module
// is dynamically imported (see card-setup), so loadStripe — and the whole Stripe
// bundle — stays out of the initial account-page payload until then. The Stripe
// preconnect in the root layout keeps the connection warm for that first open.
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = publishableKey ? loadStripe(publishableKey) : null

/**
 * Elements is a cross-origin iframe: it can't read our CSS variables or our
 * self-hosted font, so anything it should inherit must be passed in.
 *
 * Two traps. Our tokens are `oklch`, which resolves to `lab(...)` — Stripe
 * rejects that, and canvas's `fillStyle` getter preserves it rather than
 * normalising. So we *paint* the colour and read the pixel back. And
 * translucent tokens (`--border` is white at 10% in dark) must be composited
 * over their surface, or you sample near-white and draw a glaring line.
 */
function token(name: string, fallback: string, backdrop?: string): string {
  if (typeof window === "undefined") return fallback

  const probe = document.createElement("span")
  probe.style.color = `var(${name})`
  probe.style.display = "none"
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  if (!resolved) return fallback

  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext("2d")
  if (!ctx) return fallback

  if (backdrop) {
    ctx.fillStyle = backdrop
    ctx.fillRect(0, 0, 1, 1)
  }
  ctx.fillStyle = resolved
  ctx.fillRect(0, 0, 1, 1)

  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

/** Translucent variant of an `rgb()` string — Stripe won't parse color-mix(). */
function alpha(rgb: string, amount: number): string {
  const match = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb)
  if (!match) return rgb
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${amount})`
}

/**
 * `mode: "setup"` + `setupFutureUsage: "off_session"` makes Stripe show only
 * methods that can actually be saved and charged later without the customer
 * present — which is the whole point of this screen.
 *
 * Deferred intent: the form renders with no clientSecret, so there's nothing to
 * wait for and no SetupIntent is created for people who never submit.
 */
export function StripeSetup({ onDone }: { onDone: () => void }) {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"

  const surface = token("--card", dark ? "rgb(26, 33, 38)" : "rgb(255, 255, 255)")
  const field = token("--background", dark ? "rgb(16, 22, 25)" : "rgb(255, 255, 255)", surface)
  const primary = token("--primary", "rgb(63, 174, 142)", surface)
  const text = token("--foreground", dark ? "rgb(242, 247, 247)" : "rgb(20, 26, 31)", surface)
  const subtle = token("--muted-foreground", "rgb(139, 150, 157)", surface)
  const border = token("--border", dark ? "rgb(42, 51, 57)" : "rgb(227, 230, 232)", field)
  const danger = token("--destructive", "rgb(226, 115, 93)", surface)

  const options: StripeElementsOptions = {
    mode: "setup",
    // Lessons are priced in GBP wherever the student is; their bank handles FX.
    currency: "gbp",
    setupFutureUsage: "off_session",
    // Card only, to match the card-only SetupIntent the server creates. Naming the
    // method explicitly also takes the deferred Element out of automatic-payment-
    // methods mode, which is what otherwise forces a confirmParams.return_url.
    paymentMethodTypes: ["card"],
    loader: "never",
    fonts: [
      {
        cssSrc:
          "https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;500;600&display=swap",
      },
    ],
    appearance: {
      theme: dark ? "night" : "stripe",
      variables: {
        fontFamily: '"Nunito Sans", system-ui, sans-serif',
        fontSizeBase: "15px",
        spacingUnit: "4px",
        borderRadius: "10px",
        colorPrimary: primary,
        colorBackground: surface,
        colorText: text,
        colorTextSecondary: subtle,
        colorDanger: danger,
      },
      rules: {
        // Stripe wraps the fields in its own bordered block; nested in our card
        // that reads as a widget bolted on. Flatten it onto our surface.
        ".AccordionItem": {
          border: "none",
          boxShadow: "none",
          backgroundColor: "transparent",
          padding: "0px",
        },
        ".Block": {
          border: "none",
          boxShadow: "none",
          backgroundColor: "transparent",
          padding: "0px",
        },
        ".Tab": { border: `1px solid ${border}`, backgroundColor: field, boxShadow: "none" },
        ".Tab--selected": { borderColor: primary, backgroundColor: field, color: text },
        ".TabIcon--selected": { fill: primary },
        ".TabLabel--selected": { color: text },
        ".Input": {
          backgroundColor: field,
          border: `1px solid ${border}`,
          boxShadow: "none",
          padding: "10px 12px",
        },
        ".Input:focus": {
          border: `1px solid ${primary}`,
          boxShadow: `0 0 0 3px ${alpha(primary, 0.3)}`,
        },
        ".Input::placeholder": { color: subtle },
        ".Label": { color: subtle, fontWeight: "500", fontSize: "13px" },
        ".TermsText": { color: subtle, fontSize: "12px" },
        ".Error": { color: danger, fontSize: "13px" },
      },
    },
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <SetupForm onDone={onDone} />
    </Elements>
  )
}

function SetupForm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()

  const [pending, setPending] = useState(false)

  const start = useAction(startCardSetup)
  const confirm = useAction(confirmCardSetup, {
    onSuccess: () => {
      haptic()
      toast.success("Payment method saved")
      onDone()
      router.refresh()
    },
    onError: () => toast.error("Couldn't save that payment method."),
  })

  async function save() {
    if (!stripe || !elements) return
    setPending(true)
    try {
      const { error: invalid } = await elements.submit()
      if (invalid) {
        toast.error(invalid.message ?? "Check your details.")
        return
      }

      // The SetupIntent is only created now — never just to render the form.
      const created = await start.executeAsync({})
      const clientSecret = created?.data?.clientSecret
      if (!clientSecret) {
        toast.error("Couldn't start setup.")
        return
      }

      // SCA / 3DS happens here — on-session, once. The mandate it creates is
      // what lets us charge off-session at T−24h.
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        clientSecret,
        // No return_url needed: the Element is card-only (paymentMethodTypes above),
        // so nothing here can trigger a redirect and confirmSetup resolves inline.
        redirect: "if_required",
      })
      if (error) {
        toast.error(error.message ?? "That payment method couldn't be verified.")
        return
      }

      const paymentMethodId =
        typeof setupIntent?.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent?.payment_method?.id
      if (!paymentMethodId) {
        toast.error("Stripe didn't return a payment method.")
        return
      }

      confirm.execute({ paymentMethodId })
    } finally {
      setPending(false)
    }
  }

  const busy = pending || confirm.isPending

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
        className="flex flex-col gap-4"
      >
        <PaymentElement options={{ layout: { type: "tabs", defaultCollapsed: false } }} />

        <Button type="submit" size="lg" disabled={!stripe || busy}>
          {busy ? "Saving…" : "Save payment method"}
        </Button>
      </form>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3 shrink-0" />
        Stored securely by Stripe. Saving it allows us to charge for future lessons, 24 hours
        before each one.
      </p>
    </div>
  )
}
