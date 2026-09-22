import { createFileRoute } from '@tanstack/react-router'
import { RoutesAdmin } from '@/features/operations'
export const Route = createFileRoute('/_authenticated/routes/')({ component: RoutesAdmin })
