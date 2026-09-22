import { createFileRoute } from '@tanstack/react-router'
import { TracksAdmin } from '@/features/operations'
export const Route = createFileRoute('/_authenticated/tracks/')({ component: TracksAdmin })
