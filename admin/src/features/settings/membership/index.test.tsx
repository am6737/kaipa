import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { membershipApi } from '@/lib/supabase'
import { SettingsMembership } from './index'

vi.mock('@/lib/supabase',()=>({membershipApi:vi.fn()}))
const snapshot={
  role:'viewer',runtime:{stage:'open_access',free_policy:'free-v1',member_policy:'member-v1',purchase_enabled:false},
  campaigns:[{id:'initial-open-access',ends_at:null,notice_days:14,transition_days:30}],grants:[],policies:[],limits:[],budgets:[],today:[],overages:0,
  storage:0,storedObjects:0,admissions:[],distribution:[],maintenance:{checked_at:null,report:{}},
}
beforeEach(()=>{vi.clearAllMocks()})
function page(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><SettingsMembership/></QueryClientProvider>)}
it('uses the server role to keep viewer controls read only',async()=>{
  vi.mocked(membershipApi).mockResolvedValue({...snapshot,role:'viewer'})
  const screen=await page()
  await expect.element(screen.getByText('当前角色只能查看配置。')).toBeVisible()
  await expect.element(screen.getByRole('button',{name:'安排开放结束'})).not.toBeInTheDocument()
  expect(membershipApi).toHaveBeenCalledOnce()
})
it('requires a reason and review before the owner can publish a change',async()=>{
  vi.mocked(membershipApi).mockResolvedValue({...snapshot,role:'owner'})
  const screen=await page()
  await userEvent.click(screen.getByRole('button',{name:'安排开放结束'}))
  await userEvent.click(screen.getByRole('button',{name:'检查并预览变更'}))
  await expect.element(screen.getByRole('alert')).toHaveTextContent('请填写至少 3 个字的变更原因')
  expect(membershipApi).toHaveBeenCalledOnce()
  await userEvent.fill(screen.getByRole('textbox',{name:'变更原因'}),'测试结束公告')
  await userEvent.click(screen.getByRole('button',{name:'检查并预览变更'}))
  await expect.element(screen.getByRole('button',{name:'确认保存变更'})).toBeVisible()
  expect(membershipApi).toHaveBeenCalledOnce()
  await userEvent.click(screen.getByRole('button',{name:'确认保存变更'}))
  await expect.element(screen.getByRole('status')).toHaveTextContent('配置已保存，审计记录已生成。')
  expect(membershipApi).toHaveBeenLastCalledWith(expect.objectContaining({action:'admin_configure',operation:'schedule_end',reason:'测试结束公告',configuration:expect.objectContaining({campaignId:'initial-open-access'})}))
})
