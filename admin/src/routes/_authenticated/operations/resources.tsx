import { createFileRoute } from '@tanstack/react-router'
import { OperationsResources } from '@/features/operations/resources'
export const Route = createFileRoute('/_authenticated/operations/resources')({ component: OperationsResources })
