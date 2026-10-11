import { createFileRoute } from '@tanstack/react-router'
import { RouteKnowledge } from '@/features/route-knowledge'
export const Route = createFileRoute('/_authenticated/route-knowledge/')({ component: RouteKnowledge })
