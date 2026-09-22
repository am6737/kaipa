import { createFileRoute } from '@tanstack/react-router'
import { NotificationsAdmin } from '@/features/notifications'
export const Route = createFileRoute('/_authenticated/notifications/')({ component: NotificationsAdmin })
