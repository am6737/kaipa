import { createFileRoute } from '@tanstack/react-router'
import { ContentModeration } from '@/features/content'
export const Route = createFileRoute('/_authenticated/content/')({ component: ContentModeration })
