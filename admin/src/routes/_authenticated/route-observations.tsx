import { createFileRoute } from '@tanstack/react-router'
import { RouteObservations } from '@/features/route-observations'
export const Route = createFileRoute('/_authenticated/route-observations')({ component: RouteObservations })
