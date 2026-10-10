import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { membershipApi } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ContentSection } from '../components/content-section'

type Limit = { policy_version:string; resource:string; period:string; commercial_limit:number; hard_limit:number; mode:string }
type Snapshot = {
  role:string
  runtime: { stage:string; free_policy:string; member_policy:string; purchase_enabled:boolean }
  campaigns: {id:string; ends_at:string|null; notice_days:number; transition_days:number}[]
  grants:{id:string;user_id:string;source:string;ends_at:string|null;is_lifetime:boolean;revoked_at:string|null;reason:string}[]
  policies: {version:string;features:Record<string,boolean>}[]
  limits:Limit[]
  budgets:{service:string;enabled:boolean;daily_units:number;per_run_units:number}[]
  today:{service:string;used:number}[]
  maintenance:{checked_at:string|null;report:Record<string,unknown>}
  storage:number
  storedObjects:number
  admissions:{scope:string;result:string;requests:number}[]
  distribution:{resource:string;active_accounts:number;p50:number;p95:number;p99:number}[]
  overages:number
  runtimeControls?: {
    features:{key:string;state:'enabled'|'limited'|'disabled';reason:string;updated_at:string}[]
    registrationPolicy:{daily_global_limit:number}
    registrationToday:{attempts?:number;accepted?:number;day?:string}
  }
}
export function SettingsMembership() {
  const client = useQueryClient()
  const query = useQuery({queryKey:['membership-admin'],queryFn:()=>membershipApi<Snapshot>({action:'admin_snapshot'})})
  const [reason,setReason] = useState('')
  const [operation,setOperation] = useState('schedule_end')
  const [configuration,setConfiguration] = useState('')
  const [preview,setPreview] = useState<Record<string,unknown>|null>(null)
  const [inputError,setInputError] = useState('')
  const mutation = useMutation({mutationFn:(data:Record<string,unknown>)=>membershipApi<Snapshot>({action:'admin_configure',operation,configuration:data,reason}),onSuccess:data=>{client.setQueryData(['membership-admin'],data);setPreview(null)}})
  const snapshot = query.data
  const canWrite = snapshot?.role === 'owner' || snapshot?.role === 'admin'
  function choose(action:string,data:Record<string,unknown>) {setOperation(action);setConfiguration(JSON.stringify(data,null,2));setPreview(null);setReason('');setInputError('')}
  function review() {
    try {const value:unknown=JSON.parse(configuration);if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error('配置必须是 JSON 对象');if(reason.trim().length<3) throw new Error('请填写至少 3 个字的变更原因');setPreview(value as Record<string,unknown>);setInputError('')}
    catch(error) {setInputError(error instanceof Error?error.message:'配置格式错误')}
  }
  return <ContentSection title='会员与权益' desc='管理会员活动、授权和购买策略。功能开关与资源配额位于独立的运营页面。'>
    <div className='space-y-6'>
      {query.isPending && <p>正在读取配置…</p>}
      {query.error && <div role='alert'>{query.error.message}<Button onClick={()=>void query.refetch()}>重试</Button></div>}
      {snapshot && <>
        <p>免费策略：{snapshot.runtime.free_policy} · 会员策略：{snapshot.runtime.member_policy}</p>
        <div className='overflow-auto'><table className='w-full text-sm'><thead><tr><th>服务</th><th>当前用量／今日请求</th><th>每日预算／存储容量</th><th>状态</th></tr></thead><tbody>{snapshot.budgets.map(b=><tr key={b.service}><td>{b.service}</td><td>{b.service==='stored_bytes'?snapshot.storage:b.service==='stored_objects'?snapshot.storedObjects:snapshot.today.find(t=>t.service===b.service)?.used || 0}</td><td>{b.daily_units}</td><td>{b.enabled?'开启':'关闭'}</td></tr>)}</tbody></table></div>
        {snapshot.campaigns.map(c=><p key={c.id}>{c.id}：{c.ends_at || '持续免费开放'}；提前 {c.notice_days} 天通知，结束后 {c.transition_days} 天过渡。</p>)}
        <details><summary>资源分布（当前周期，非零用量账号）</summary><pre className='overflow-auto text-xs'>{JSON.stringify(snapshot.distribution,null,2)}</pre></details>
        <details><summary>准入结果（最近 30 天）</summary><pre className='overflow-auto text-xs'>{JSON.stringify(snapshot.admissions,null,2)}</pre></details>
        <details><summary>最近对账：{snapshot.maintenance.checked_at || '尚未执行'}</summary><pre className='overflow-auto text-xs'>{JSON.stringify(snapshot.maintenance.report,null,2)}</pre></details>
        <details><summary>最近会员授权（最多 100 条，可复制授权 ID 撤销赠送）</summary><pre className='overflow-auto text-xs'>{JSON.stringify(snapshot.grants,null,2)}</pre></details>
        <details><summary>当前额度策略</summary><pre className='overflow-auto text-xs'>{JSON.stringify(snapshot.limits,null,2)}</pre></details>
        {canWrite ? <details className='rounded border p-4'><summary className='cursor-pointer font-medium'>高级会员、预算与额度策略</summary><div className='mt-4 space-y-6'>
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' onClick={()=>choose('schedule_end',{campaignId:snapshot.campaigns[0]?.id,endsAt:new Date(Date.now()+15*86400000).toISOString()})}>安排开放结束</Button>
            <Button variant='outline' onClick={()=>choose('set_budget',{service:'ai_tokens',enabled:true,dailyUnits:20000000,perRunUnits:400000})}>调整服务预算</Button>
            <Button variant='outline' onClick={()=>choose('gift',{requestId:crypto.randomUUID(),userId:'',endsAt:new Date(Date.now()+30*86400000).toISOString(),isLifetime:false})}>赠送会员</Button>
            <Button variant='outline' onClick={()=>choose('revoke_gift',{grantId:''})}>撤销赠送</Button>
            <Button variant='outline' onClick={()=>choose('set_stage',{stage:'trial_operation'})}>调整运营阶段</Button>
            <Button variant='outline' onClick={()=>choose('publish_policy',{target:'free',version:'free-'+Date.now(),features:snapshot.policies.find(p=>p.version===snapshot.runtime.free_policy)?.features || {},limits:snapshot.limits.filter(l=>l.policy_version===snapshot.runtime.free_policy).map(l=>({resource:l.resource,period:l.period,limit:l.commercial_limit,hardLimit:l.hard_limit,mode:l.mode}))})}>发布新额度策略</Button>
          </div>
          <p>操作：{operation}</p>
          <label className='block'>配置<textarea aria-label='会员配置' className='mt-2 h-64 w-full rounded border p-3 font-mono text-sm' value={configuration} onChange={e=>{setConfiguration(e.target.value);setPreview(null)}} /></label>
          <label className='block'>变更原因<Input value={reason} onChange={e=>{setReason(e.target.value);setPreview(null)}} maxLength={500}/></label>
          <Button onClick={review} disabled={!configuration || mutation.isPending}>检查并预览变更</Button>
          {preview && <div className='space-y-3 rounded border p-4'><p>此变更立即影响会员权益或资源策略；已有数据保留。</p><pre className='overflow-auto text-xs'>{JSON.stringify(preview,null,2)}</pre><p>原因：{reason}</p><Button disabled={mutation.isPending} onClick={()=>mutation.mutate(preview)}>确认保存变更</Button></div>}
          {(inputError || mutation.error) && <p role='alert' className='text-destructive'>{inputError || mutation.error?.message}</p>}
          {mutation.isSuccess && <p role='status'>配置已保存，审计记录已生成。</p>}
        </div></details> : <p>当前角色只能查看配置。</p>}
      </>}
    </div>
  </ContentSection>
}
