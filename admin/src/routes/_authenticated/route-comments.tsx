import { createFileRoute } from '@tanstack/react-router'
import { RouteComments } from '@/features/route-comments'
export const Route = createFileRoute('/_authenticated/route-comments')({ component: RouteComments })
