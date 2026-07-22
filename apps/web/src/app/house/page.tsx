import type { Metadata } from 'next'
import { HousePage } from '@iedora/product-house/house-page'

export const metadata: Metadata = {
  title: 'iedora · software house. Custom builds, AI workshops, products we run.',
  description:
    'A small software house. We build custom products end to end, from the first commit to the servers they run on, run hands-on AI workshops, and ship our own (Menu is live today).',
}

export default function Page() {
  return <HousePage />
}
