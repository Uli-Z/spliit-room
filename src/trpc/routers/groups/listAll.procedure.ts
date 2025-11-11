import { getAllGroups } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'

export const listAllGroupsProcedure = baseProcedure.query(async () => {
  const groups = await getAllGroups()
  return { groups }
})
