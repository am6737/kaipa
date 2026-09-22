import { Backpack, Bell, Bot, BookMarked, FileClock, Image, LayoutDashboard, Map, Route, Settings, Users, Waypoints } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: { name: 'Kaipa 管理员', email: 'Supabase 管理账号', avatar: '/avatars/shadcn.jpg' },
  teams: [{ name: 'Kaipa Admin', logo: LayoutDashboard, plan: 'Supabase 数据后台' }],
  navGroups: [
    {
      title: '数据管理',
      items: [
        { title: '概览', url: '/', icon: LayoutDashboard },
        { title: '用户管理', url: '/users', icon: Users },
        { title: '旅程管理', url: '/journeys', icon: Map },
        { title: '装备库', url: '/gear', icon: Backpack },
        { title: '路线目录', url: '/routes', icon: Route },
        { title: '线路资料', url: '/route-facts', icon: BookMarked },
        { title: '轨迹库', url: '/tracks', icon: Waypoints },
        { title: '内容审核', url: '/content', icon: Image },
      ],
    },
    {
      title: '系统',
      items: [
        { title: 'AI 运行监控', url: '/agent-runs', icon: Bot },
        { title: '审计日志', url: '/audit', icon: FileClock },
        { title: '通知中心', url: '/notifications', icon: Bell },
        { title: '设置', icon: Settings, items: [
        { title: '账户', url: '/settings/account' },
        { title: '外观', url: '/settings/appearance' },
        { title: '通知', url: '/settings/notifications' },
        ] },
      ],
    },
  ],
}
