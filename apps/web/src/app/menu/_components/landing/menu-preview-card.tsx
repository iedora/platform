'use client'

import { useState } from 'react'
import { QrCodeIcon, StarIcon } from '@phosphor-icons/react'
import { Card, CardContent } from '@iedora/ui/components/ui/card'
import { Tag } from '../../../../components/landing'

type Dish = { name: string; price: string }

/**
 * Interactive demo of the multilingual menu. The language chips are real
 * buttons: tapping one live-translates the card's chrome (scan prompt, the
 * "today's special" label, the house note) so a visitor can feel the
 * multilingual feature on the landing page itself. Dish names stay put — food
 * names usually do — which keeps the demo honest.
 */
const CHROME: Record<string, { scan: string; special: string; note: string }> = {
  EN: { scan: 'Scan to view', special: "Today's special", note: 'wood-fired since 1998' },
  PT: { scan: 'Digitalize para ver', special: 'Especial de hoje', note: 'a lenha desde 1998' },
  ES: { scan: 'Escanea para ver', special: 'Especial de hoy', note: 'al horno de leña desde 1998' },
  FR: { scan: 'Scannez pour voir', special: 'Plat du jour', note: 'au feu de bois depuis 1998' },
  IT: { scan: 'Scansiona per vedere', special: 'Speciale di oggi', note: 'a legna dal 1998' },
  DE: { scan: 'Zum Ansehen scannen', special: 'Tagesgericht', note: 'Holzofen seit 1998' },
}
const ORDER = ['EN', 'PT', 'ES', 'FR', 'IT', 'DE']

function Leader() {
  return <span className="h-px flex-1 self-center border-b border-dotted border-border" aria-hidden="true" />
}

export function MenuPreviewCard({
  name,
  dishes,
  initialLang,
}: {
  name: string
  dishes: Dish[]
  initialLang?: string
}) {
  const start = initialLang && CHROME[initialLang.toUpperCase()] ? initialLang.toUpperCase() : 'EN'
  const [lang, setLang] = useState(start)
  const c = CHROME[lang]!
  const special = dishes[0]
  const rest = dishes.slice(1)

  return (
    <Card size="sm" className="w-full lg:max-w-md lg:justify-self-end" data-test-id="menu-preview-card">
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading text-[20px] font-extrabold">{name}</p>
            <p className="truncate text-[12px] italic text-muted-foreground">{c.note}</p>
          </div>
          <Tag tone="primary">
            <QrCodeIcon size={13} weight="bold" />
            {c.scan}
          </Tag>
        </div>

        {special ? (
          <div className="mt-4 flex items-baseline gap-2 rounded-[12px] bg-amber-500/10 px-3 py-2.5">
            <StarIcon size={15} weight="fill" className="shrink-0 self-center text-amber-500" />
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-600">
              {c.special}
            </span>
            <span className="truncate text-[15px] font-bold">{special.name}</span>
            <Leader />
            <span className="text-[15px] font-bold tabular-nums">{special.price}</span>
          </div>
        ) : null}

        <ul className="mt-4 flex flex-col gap-3">
          {rest.map((d) => (
            <li key={d.name} className="flex items-baseline gap-2 text-[15px]">
              <span className="font-medium">{d.name}</span>
              <Leader />
              <span className="font-semibold tabular-nums text-muted-foreground">{d.price}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Preview language">
          {ORDER.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={l === lang}
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                l === lang
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
              }`}
              data-test-id={`menu-preview-lang-${l}`}
            >
              {l}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
