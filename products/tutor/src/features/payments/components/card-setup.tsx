"use client"

import { Button } from "@iedora/ui/components/ui/button"
import { CreditCard, TriangleAlert } from "lucide-react"
import dynamic from "next/dynamic"
import { useState } from "react"

import type { SavedCardDTO as SavedCard } from "@iedora/product-tutor/contracts/payments"

// The Stripe form (Stripe.js + Elements, ~100KB+) loads only when someone actually
// opens it, not on every account visit. Client-only: it's all iframes and browser
// APIs with nothing to server-render. The skeleton holds its space while it loads.
const StripeSetup = dynamic(() => import("./stripe-setup").then((m) => m.StripeSetup), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-lg bg-muted" />,
})

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

export function CardSetup({ card }: { card: SavedCard | null }) {
  const [replacing, setReplacing] = useState(false)

  if (!publishableKey) {
    return (
      <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Stripe isn&apos;t configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
      </p>
    )
  }

  const showForm = !card || replacing

  return (
    <div className="flex flex-col gap-3">
      {card && !replacing && <SavedMethodRow card={card} onReplace={() => setReplacing(true)} />}

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-1 text-sm font-medium">
            {card ? "Replace your payment method" : "Add a payment method"}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Lessons are charged 24 hours before they start — never before.
          </p>
          <StripeSetup onDone={() => setReplacing(false)} />
        </div>
      )}
    </div>
  )
}

function SavedMethodRow({ card, onReplace }: { card: SavedCard; onReplace: () => void }) {
  // A wallet or Link method is chargeable but may expose no brand/last4.
  const label = card.last4 ? `${card.brand} •••• ${card.last4}` : "Saved payment method"
  const expiry =
    card.expMonth && card.expYear
      ? `Expires ${String(card.expMonth).padStart(2, "0")}/${card.expYear}`
      : "Charged automatically before each lesson"

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <CreditCard className="size-5 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-sm font-medium capitalize">{label}</span>
            <span className="block font-mono text-xs text-muted-foreground">{expiry}</span>
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={onReplace}>
          Replace
        </Button>
      </div>

      {card.expired && (
        <p className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" />
          This card has expired — replace it or your next lesson won&apos;t be paid.
        </p>
      )}
    </div>
  )
}
