'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
      {pending
        ? 'Saving…'
        : published
          ? 'Unpublish'
          : 'Publish'}
    </Button>
  )
}
