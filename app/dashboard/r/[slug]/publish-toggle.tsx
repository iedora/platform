'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { setRestaurantPublished } from './actions'

export function PublishToggle({
  slug,
  published,
}: {
  slug: string
  published: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const t = useTranslations('Restaurant')

  return (
    <Button
      variant={published ? 'outline' : 'default'}
      onClick={() =>
        startTransition(async () => {
          await setRestaurantPublished(slug, !published)
          router.refresh()
        })
      }
      disabled={pending}
    >
      {pending ? t('saving') : published ? t('unpublish') : t('publish')}
    </Button>
  )
}
