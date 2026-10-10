import { createFileRoute } from '@tanstack/react-router'
import { RouteGuides } from '@/features/route-guides'
export const Route = createFileRoute('/_authenticated/route-guides')({ component: RouteGuides })
