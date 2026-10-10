import { createFileRoute } from '@tanstack/react-router'
import { OperationsFeatures } from '@/features/operations/features'
export const Route = createFileRoute('/_authenticated/operations/features')({ component: OperationsFeatures })
