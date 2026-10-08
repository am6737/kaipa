import { createFileRoute } from '@tanstack/react-router'
import { SettingsMembership } from '@/features/settings/membership'
export const Route = createFileRoute('/_authenticated/settings/membership')({ component: SettingsMembership })
