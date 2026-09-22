import { createFileRoute } from '@tanstack/react-router'
import { AuditAdmin } from '@/features/operations'
export const Route = createFileRoute('/_authenticated/audit/')({ component: AuditAdmin })
