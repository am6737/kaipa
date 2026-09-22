import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/lib/supabase'

export interface AdminOverview {
  users: number
  journeys: number
  gearItems: number
  recentJourneys: Array<{ id: string; name: string; created_at: string; user_id: string }>
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => adminApi<AdminOverview>('overview'),
    staleTime: 30_000,
  })
}
