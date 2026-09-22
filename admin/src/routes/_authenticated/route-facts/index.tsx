import { createFileRoute } from '@tanstack/react-router'
import { RouteFacts } from '@/features/route-facts'

export const Route = createFileRoute('/_authenticated/route-facts/')({ component: RouteFacts })
