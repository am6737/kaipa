import { createFileRoute } from '@tanstack/react-router'
import { Journeys } from '@/features/journeys'

export const Route = createFileRoute('/_authenticated/journeys/')({ component: Journeys })
