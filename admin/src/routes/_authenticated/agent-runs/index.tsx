import { createFileRoute } from '@tanstack/react-router'
import { AgentRunsAdmin } from '@/features/operations'
export const Route = createFileRoute('/_authenticated/agent-runs/')({ component: AgentRunsAdmin })
