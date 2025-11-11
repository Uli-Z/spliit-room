import { RecentGroupList } from '@/app/groups/recent-group-list'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Recently visited groups',
}

export default async function GroupsPage() {
  return (
    <RecentGroupList runtimeFeatureFlags={await getRuntimeFeatureFlags()} />
  )
}
