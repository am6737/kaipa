import { createFileRoute } from '@tanstack/react-router'
import { Gear } from '@/features/gear'

export const Route = createFileRoute('/_authenticated/gear/')({ component: Gear })
