import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { membershipApi } from '@/lib/supabase'
import { ContentSection } from '../../settings/components/content-section'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'

type FeatureState = 'enabled' | 'limited' | 'disabled'
type Snapshot = { role:string; runtimeControls:{features:{key:string;state:FeatureState}[];registrationPolicy:{daily_global_limit:number};registrationToday:{accepted?:number}} }
const names:Record<string,string> = { registration:'开放注册', guest_account:'游客转正', smart_planning:'智能规划', purchase:'会员购买', route_condition_moderation:'路线实况审核' }

export function OperationsFeatures() {
  const client=useQueryClient()
  const query=useQuery({queryKey:['runtime-controls'],queryFn:()=>membershipApi<Snapshot>({action:'admin_snapshot'})})
  const [draft,setDraft]=useState<Record<string,FeatureState>>({})
  const [limit,setLimit]=useState('')
  const [reason,setReason]=useState('')
  const mutation=useMutation({mutationFn:(data:{key:string;state:FeatureState;configuration:Record<string,unknown>})=>membershipApi<Snapshot>({action:'runtime_configure',...data,reason}),onSuccess:data=>{client.setQueryData(['runtime-controls'],data);client.setQueryData(['membership-admin'],data)}})
  const snapshot=query.data
  const canWrite=snapshot?.role==='owner'||snapshot?.role==='admin'
  async function save(){
    if(!snapshot||reason.trim().length<3)return
    for(const feature of snapshot.runtimeControls.features) await mutation.mutateAsync({key:feature.key,state:draft[feature.key]||feature.state,configuration:feature.key==='registration'?{dailyGlobalLimit:Number(limit||snapshot.runtimeControls.registrationPolicy.daily_global_limit)}:{}})
    setReason('')
  }
  return <ContentSection title='功能与运营' desc='控制产品功能是否开放，以及注册容量。修改会立即作用于服务端，并记录审计原因。'><div className='space-y-6'>{query.isPending&&<p>正在读取设置…</p>}{query.error&&<p role='alert'>{query.error.message}</p>}{snapshot&&<><Card><CardHeader><CardTitle>功能开关</CardTitle><CardDescription>关闭只影响新请求，已有数据和历史记录仍可访问。</CardDescription></CardHeader><CardContent className='grid gap-3 sm:grid-cols-2'>{snapshot.runtimeControls.features.map(feature=><div key={feature.key} className='flex items-center justify-between rounded-lg border p-3'><div><p className='text-sm font-medium'>{names[feature.key]||feature.key}</p><Badge variant={feature.state==='enabled'?'secondary':feature.state==='limited'?'outline':'destructive'}>{feature.state==='enabled'?'开启':feature.state==='limited'?'限制模式':'关闭'}</Badge></div><select className='rounded-md border bg-background px-3 py-2 text-sm' disabled={!canWrite||mutation.isPending} value={draft[feature.key]||feature.state} onChange={e=>setDraft(v=>({...v,[feature.key]:e.target.value as FeatureState}))}><option value='enabled'>开启</option><option value='limited'>限制模式</option><option value='disabled'>关闭</option></select></div>)}</CardContent></Card><Card><CardHeader><CardTitle>注册容量</CardTitle><CardDescription>按 UTC 日期统计全站注册量。</CardDescription></CardHeader><CardContent className='grid gap-4 sm:grid-cols-2'><div><Label htmlFor='daily-limit'>每日注册上限</Label><Input id='daily-limit' type='number' min={1} value={limit||snapshot.runtimeControls.registrationPolicy.daily_global_limit} disabled={!canWrite||mutation.isPending} onChange={e=>setLimit(e.target.value)}/><p className='mt-2 text-xs text-muted-foreground'>今日已注册 {snapshot.runtimeControls.registrationToday?.accepted||0} 个</p></div>{canWrite&&<div><Label htmlFor='runtime-reason'>变更原因</Label><Input id='runtime-reason' value={reason} maxLength={500} placeholder='例如：控制注册高峰流量' onChange={e=>setReason(e.target.value)}/></div>}</CardContent>{canWrite&&<div className='flex items-center justify-between border-t px-6 py-4'><p className='text-xs text-muted-foreground'>保存后立即生效</p><Button disabled={mutation.isPending||reason.trim().length<3} onClick={()=>void save()}>保存运营设置</Button></div>}</Card>{!canWrite&&<p className='text-sm text-muted-foreground'>当前角色为只读。</p>}</>}</div></ContentSection>
}
