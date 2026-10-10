import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, adminMutation } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ConfigDrawer } from '@/components/config-drawer'
import { ProfileDropdown } from '@/components/profile-dropdown'

type Guide = { id: string; route?: { name?: string } | null; title: string; intro: string; reflection: string; status: 'pending'|'approved'|'rejected'; rejection_reason?: string | null; submitted_at: string; author?: { display_name?: string | null; nick?: string | null } | null }
const labels = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
export function RouteGuides() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['admin-route-guides'], queryFn: async () => (await adminApi<{ data: Guide[] }>('routeGuides')).data })
  const mutate = async (item: Guide, status: Guide['status']) => {
    const reason = status === 'rejected' ? window.prompt('请输入驳回原因')?.trim() : ''
    if (status === 'rejected' && !reason) return
    await adminMutation('routeGuides', { action: 'moderate-route-guide', id: item.id, status, rejection_reason: reason || '' })
    await client.invalidateQueries({ queryKey: ['admin-route-guides'] })
  }
  return <><Header fixed><Search className='me-auto' /><ThemeSwitch /><ConfigDrawer /><ProfileDropdown /></Header><Main className='flex flex-1 flex-col gap-4 sm:gap-6'><div><h2 className='text-2xl font-bold tracking-tight'>路线攻略审核</h2><p className='text-muted-foreground'>审核用户提交的真实行程攻略，通过后才会出现在 App 的路线攻略列表。</p></div>{query.isError ? <p className='text-sm text-destructive'>读取失败：{query.error instanceof Error ? query.error.message : '未知错误'}</p> : <div className='overflow-hidden rounded-md border'><table className='w-full text-sm'><thead><tr className='border-b text-left'><th className='p-3'>路线</th><th className='p-3'>标题与内容</th><th className='p-3'>作者</th><th className='p-3'>提交时间</th><th className='p-3'>状态</th><th className='p-3'>操作</th></tr></thead><tbody>{(query.data || []).map((item) => <tr className='border-b align-top' key={item.id}><td className='p-3 font-medium'>{item.route?.name || '未知路线'}</td><td className='max-w-xl p-3'><p className='font-medium'>{item.title}</p><p className='mt-1 whitespace-pre-wrap text-muted-foreground'>{item.intro || item.reflection || '—'}</p></td><td className='p-3'>{item.author?.display_name || item.author?.nick || 'Kaipa 用户'}</td><td className='whitespace-nowrap p-3'>{new Date(item.submitted_at).toLocaleString()}</td><td className='p-3'><Badge variant={item.status === 'approved' ? 'default' : item.status === 'rejected' ? 'destructive' : 'secondary'}>{labels[item.status]}</Badge>{item.rejection_reason ? <p className='mt-1 text-xs text-destructive'>{item.rejection_reason}</p> : null}</td><td className='whitespace-nowrap p-3'>{item.status !== 'approved' && <Button size='sm' variant='ghost' onClick={() => void mutate(item, 'approved')}>通过</Button>}{item.status !== 'rejected' && <Button size='sm' variant='ghost' onClick={() => void mutate(item, 'rejected')}>驳回</Button>}</td></tr>)}{!query.isLoading && !(query.data || []).length && <tr><td colSpan={6} className='p-8 text-center text-muted-foreground'>暂无攻略提交</td></tr>}</tbody></table></div>}</Main></>
}
