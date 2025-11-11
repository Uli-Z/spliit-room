import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { redirect } from 'next/navigation'
import HomePageClient from './page.client'

// FIX for https://github.com/vercel/next.js/issues/58615
// export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const { openGroupMode } = await getRuntimeFeatureFlags()
  if (openGroupMode) {
    redirect('/groups')
  }
  return <HomePageClient />
}
