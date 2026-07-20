"use client"

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import { Button } from "@iedora/ui/components/ui/button"
import { Lock } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { haptic } from "@iedora/product-tutor/lib/haptics"
import { confirmLessonPayment, startLessonPayment } from "../payments.actions"

// One-off lesson checkout. Deferred intent: the PaymentElement renders against
// the amount/currency, and the PaymentIntent is created only when the student
// pays (startLessonPayment) — its client secret is confirmed inline, then the
// server marks the lesson paid.
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = publishableKey ? loadStripe(publishableKey) : null

export function PayLesson({
  lessonId,
  amountPennies,
  currency = "gbp",
}: {
  lessonId: string
  amountPennies: number
  currency?: string
}) {
  if (!stripePromise) {
    return (
      <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Payments aren&apos;t configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
      </p>
    )
  }
  return (
    <Elements stripe={stripePromise} options={{ mode: "payment", amount: amountPennies, currency }}>
      <PayForm lessonId={lessonId} />
    </Elements>
  )
}

function PayForm({ lessonId }: { lessonId: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const start = useAction(startLessonPayment)
  const confirm = useAction(confirmLessonPayment, {
    onSuccess: () => {
      haptic()
      toast.success("Lesson paid")
      router.refresh()
    },
    onError: () => toast.error("Couldn't confirm the payment."),
  })

  async function pay() {
    if (!stripe || !elements) return
    setPending(true)
    try {
      const { error: invalid } = await elements.submit()
      if (invalid) {
        toast.error(invalid.message ?? "Check your details.")
        return
      }

      // The PaymentIntent is created now — never just to render the form.
      const created = await start.executeAsync({ lessonId })
      const clientSecret = created?.data?.clientSecret
      if (!clientSecret) {
        toast.error("Couldn't start the payment.")
        return
      }

      const { error } = await stripe.confirmPayment({
        elements,
        clientSecret,
        redirect: "if_required",
      })
      if (error) {
        toast.error(error.message ?? "Payment failed.")
        return
      }

      confirm.execute({ lessonId })
    } finally {
      setPending(false)
    }
  }

  const busy = pending || start.isPending || confirm.isPending

  return (
    <div className="flex flex-col gap-4">
      <PaymentElement />
      <Button onClick={pay} disabled={busy} className="w-full">
        <Lock className="size-4" />
        {busy ? "Paying…" : "Pay now"}
      </Button>
    </div>
  )
}
